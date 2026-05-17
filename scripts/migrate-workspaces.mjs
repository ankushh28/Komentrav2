import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { MongoClient } from 'mongodb';

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^"|"$/g, '');
  }
}

function cleanName(name) {
  return String(name || '').trim().slice(0, 80) || 'Default Workspace';
}

async function getOrCreateWorkspace(db, userId, key, name) {
  const now = new Date();
  const result = await db.collection('workspaces').findOneAndUpdate(
    { ownerUserId: userId, migrationKey: key },
    {
      $setOnInsert: {
        _id: randomUUID(),
        ownerUserId: userId,
        name: cleanName(name),
        status: 'active',
        migrationKey: key,
        createdAt: now,
      },
      $set: { updatedAt: now },
    },
    { upsert: true, returnDocument: 'after' },
  );
  return result.value || result;
}

async function migrateUser(db, user) {
  const userId = user._id;
  const now = new Date();
  const accounts = await db.collection('instagram_accounts').find({ connectedUserId: userId }).toArray();
  const accountIds = accounts.map(account => account._id);

  for (const account of accounts) {
    let workspaceId = account.workspaceId;
    if (!workspaceId) {
      const workspace = await getOrCreateWorkspace(
        db,
        userId,
        `ig:${account._id}`,
        account.username ? `@${account.username}` : 'Instagram Workspace',
      );
      workspaceId = workspace._id;
      await db.collection('instagram_accounts').updateOne(
        { _id: account._id, connectedUserId: userId },
        { $set: { workspaceId, updatedAt: now } },
      );
    }

    await db.collection('automations').updateMany(
      { userId, instagramAccountId: account._id, workspaceId: { $exists: false } },
      { $set: { workspaceId, updatedAt: now } },
    );
    await db.collection('automation_runs').updateMany(
      { userId, instagramAccountId: account._id, workspaceId: { $exists: false } },
      { $set: { workspaceId } },
    );
  }

  const orphanAutomations = await db.collection('automations').find({
    userId,
    workspaceId: { $exists: false },
    ...(accountIds.length ? { instagramAccountId: { $nin: accountIds } } : {}),
  }).project({ _id: 1 }).toArray();

  if (orphanAutomations.length > 0 || accounts.length === 0) {
    const fallback = await getOrCreateWorkspace(db, userId, 'default', 'Default Workspace');
    const orphanIds = orphanAutomations.map(automation => automation._id);
    if (orphanIds.length > 0) {
      await db.collection('automations').updateMany(
        { _id: { $in: orphanIds }, userId },
        { $set: { workspaceId: fallback._id, updatedAt: now } },
      );
      await db.collection('automation_runs').updateMany(
        { userId, automationId: { $in: orphanIds }, workspaceId: { $exists: false } },
        { $set: { workspaceId: fallback._id } },
      );
    }
  }
}

loadEnv();

if (!process.env.MONGO_URL) {
  throw new Error('MONGO_URL is required');
}

const client = new MongoClient(process.env.MONGO_URL);
await client.connect();
const db = client.db(process.env.DB_NAME || 'ig_automation');

await db.collection('workspaces').createIndex({ ownerUserId: 1, status: 1 });
await db.collection('instagram_accounts').createIndex({ workspaceId: 1 }, { unique: true, sparse: true });
await db.collection('instagram_accounts').createIndex({ connectedUserId: 1, workspaceId: 1 });
await db.collection('automations').createIndex({ userId: 1, workspaceId: 1 });
await db.collection('automation_runs').createIndex({ userId: 1, workspaceId: 1, ranAt: -1 });

const users = await db.collection('users').find({}).toArray();
for (const user of users) {
  await migrateUser(db, user);
  console.log(`Migrated user ${user.email || user._id}`);
}

console.log(`Workspace migration complete for ${users.length} users.`);
await client.close();
