import fs from 'fs';
import path from 'path';
import { MongoClient } from 'mongodb';

const ACCOUNT_ID = process.argv[2] || '8c8c47f5-ff74-4e59-8d9c-75892fbdbbe8';
const UNSUPPORTED_OBJECT_TERMS = [
  'unsupported post request',
  'object with id',
  'does not exist',
  'cannot be loaded',
  'does not support this operation',
];
const SERIOUS_TERMS = [
  'access token',
  'session has expired',
  'invalid oauth',
  'missing permission',
  'permissions error',
  'does not have permission',
  'does not have the capability',
  'rate limit',
  'too many',
  'temporarily blocked',
  'temporarily restricted',
];

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

function includesAny(value, terms) {
  const text = String(value || '').toLowerCase();
  return terms.some(term => text.includes(term));
}

loadEnv();

if (!process.env.MONGO_URL) {
  console.error('MONGO_URL is required');
  process.exit(1);
}

const client = new MongoClient(process.env.MONGO_URL);
await client.connect();

try {
  const db = client.db(process.env.DB_NAME || 'ig_automation');
  const acct = await db.collection('instagram_accounts').findOne(
    { _id: ACCOUNT_ID },
    { projection: { _id: 1, automationPausedUntil: 1, automationPauseReason: 1 } },
  );

  if (!acct) {
    console.log(`Account ${ACCOUNT_ID} not found`);
    process.exit(0);
  }

  const reason = acct.automationPauseReason || '';
  const isUnsupportedObject = includesAny(reason, UNSUPPORTED_OBJECT_TERMS);
  const isSerious = includesAny(reason, SERIOUS_TERMS);

  if (!acct.automationPausedUntil) {
    console.log(`Account ${ACCOUNT_ID} is not paused`);
  } else if (isUnsupportedObject && !isSerious) {
    await db.collection('instagram_accounts').updateOne(
      { _id: ACCOUNT_ID },
      {
        $unset: {
          automationPausedUntil: '',
          automationPauseReason: '',
        },
        $set: { updatedAt: new Date() },
      },
    );
    console.log(`Cleared unsupported-object pause for account ${ACCOUNT_ID}`);
  } else {
    console.log(`Kept pause for account ${ACCOUNT_ID}: ${reason || 'no reason stored'}`);
  }
} finally {
  await client.close();
}
