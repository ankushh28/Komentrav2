import { DEFAULT_PLAN_ID, getPlan, publicPlan, publicPlans } from './plans.js';

let entitlementIndexesPromise;

export function monthKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function subscriptionStillCurrent(subscription = {}, now = new Date()) {
  if (!subscription.currentPeriodEnd) return false;
  const end = new Date(subscription.currentPeriodEnd);
  return !Number.isNaN(end.getTime()) && end > now;
}

export function activePlanIdFromUser(user, now = new Date()) {
  const subscription = user?.subscription || {};
  const planId = subscription.planId || DEFAULT_PLAN_ID;
  if (planId === DEFAULT_PLAN_ID) return DEFAULT_PLAN_ID;
  const status = String(subscription.status || '').toLowerCase();
  if (['active', 'authenticated'].includes(status)) return planId;
  if (subscription.cancelAtPeriodEnd && subscriptionStillCurrent(subscription, now)) return planId;
  return DEFAULT_PLAN_ID;
}

export async function ensureEntitlementIndexes(db) {
  if (!entitlementIndexesPromise) {
    entitlementIndexesPromise = Promise.all([
      db.collection('usage_counters').createIndex({ userId: 1, workspaceId: 1, month: 1 }, { unique: true }),
      db.collection('billing_events').createIndex({ eventId: 1 }, { unique: true, sparse: true }),
      db.collection('billing_events').createIndex({ receivedAt: -1 }),
    ]).catch((e) => {
      entitlementIndexesPromise = null;
      console.error('[entitlements] index setup failed', e?.message);
    });
  }
  await entitlementIndexesPromise;
}

export async function getUserEntitlements(db, userId, now = new Date()) {
  await ensureEntitlementIndexes(db);
  const user = await db.collection('users').findOne(
    { _id: userId },
    { projection: { email: 1, username: 1, subscription: 1 } },
  );
  const planId = activePlanIdFromUser(user, now);
  const plan = getPlan(planId);
  return {
    user,
    plan,
    planId,
    subscription: user?.subscription || { planId: DEFAULT_PLAN_ID, status: 'free' },
  };
}

export async function getWorkspaceUsage(db, userId, workspaceId, date = new Date()) {
  await ensureEntitlementIndexes(db);
  const key = monthKey(date);
  const counter = await db.collection('usage_counters').findOne({ userId, workspaceId, month: key });
  return {
    month: key,
    triggersUsed: counter?.triggersUsed || 0,
    updatedAt: counter?.updatedAt || null,
  };
}

export async function getBillingStatus(db, userId) {
  const { plan, planId, subscription } = await getUserEntitlements(db, userId);
  const workspaces = await db.collection('workspaces').find({ ownerUserId: userId }).toArray();
  const workspaceIds = workspaces.map(w => w._id);
  const eventSubscriptionId = subscription?.providerSubscriptionId || null;
  const [accounts, automationCounts, usageRows, billingEvents] = await Promise.all([
    db.collection('instagram_accounts').find({ connectedUserId: userId }).toArray(),
    db.collection('automations').aggregate([
      { $match: { userId, workspaceId: { $in: workspaceIds }, isActive: true } },
      { $group: { _id: '$workspaceId', activeAutomations: { $sum: 1 } } },
    ]).toArray(),
    db.collection('usage_counters').find({ userId, month: monthKey(), workspaceId: { $in: workspaceIds } }).toArray(),
    eventSubscriptionId
      ? db.collection('billing_events')
        .find({
          $or: [
            { 'payload.payload.subscription.entity.id': eventSubscriptionId },
            { 'payload.payload.payment.entity.subscription_id': eventSubscriptionId },
          ],
        })
        .sort({ receivedAt: -1 })
        .limit(10)
        .project({
          _id: 1,
          eventId: 1,
          event: 1,
          receivedAt: 1,
          'payload.payload.subscription.entity.status': 1,
          'payload.payload.payment.entity.status': 1,
        })
        .toArray()
      : [],
  ]);
  const automationsByWorkspace = new Map(automationCounts.map(row => [row._id, row.activeAutomations]));
  const usageByWorkspace = new Map(usageRows.map(row => [row.workspaceId, row]));
  return {
    plan: publicPlan(plan),
    plans: publicPlans(),
    subscription: {
      planId,
      status: subscription.status || (planId === DEFAULT_PLAN_ID ? 'free' : 'inactive'),
      provider: subscription.provider || null,
      currentPeriodStart: subscription.currentPeriodStart || null,
      currentPeriodEnd: subscription.currentPeriodEnd || null,
      cancelAtPeriodEnd: !!subscription.cancelAtPeriodEnd,
      scheduledPlanId: subscription.scheduledPlanId || null,
      scheduledPlanAt: subscription.scheduledPlanAt || null,
      lastPaymentStatus: subscription.lastPaymentStatus || null,
      updatedAt: subscription.updatedAt || null,
    },
    usage: {
      month: monthKey(),
      workspaces: {
        used: workspaces.length,
        limit: plan.maxWorkspaces,
      },
      accounts: {
        used: accounts.length,
        limit: plan.maxAccounts,
      },
      workspacesBreakdown: workspaces.map(workspace => {
        const usage = usageByWorkspace.get(workspace._id);
        return {
          id: workspace._id,
          name: workspace.name,
          status: workspace.status || 'active',
          activeAutomations: automationsByWorkspace.get(workspace._id) || 0,
          activeAutomationsLimit: plan.maxActiveAutomationsPerWorkspace,
          triggersUsed: usage?.triggersUsed || 0,
          triggerLimit: plan.monthlyTriggersPerWorkspace,
          triggerUsagePercent: Math.min(100, Math.round(((usage?.triggersUsed || 0) / Math.max(plan.monthlyTriggersPerWorkspace, 1)) * 100)),
        };
      }),
    },
    billingEvents: billingEvents.map(event => ({
      id: event.eventId || event._id,
      event: event.event,
      receivedAt: event.receivedAt,
      subscriptionStatus: event.payload?.payload?.subscription?.entity?.status || null,
      paymentStatus: event.payload?.payload?.payment?.entity?.status || null,
    })),
  };
}

export function entitlementError({ code, message, plan, current = null, limit = null, upgradePlanId = null }) {
  return {
    error: message,
    code,
    billing: {
      current,
      limit,
      plan: publicPlan(plan),
      upgradePlanId,
    },
  };
}

export async function checkCanCreateWorkspace(db, userId) {
  const { plan } = await getUserEntitlements(db, userId);
  const count = await db.collection('workspaces').countDocuments({ ownerUserId: userId });
  if (count >= plan.maxWorkspaces) {
    return {
      ok: false,
      details: entitlementError({
        code: 'workspace_limit',
        message: `Your ${plan.name} plan includes ${plan.maxWorkspaces} workspace${plan.maxWorkspaces === 1 ? '' : 's'}. Upgrade to add another workspace.`,
        plan,
        current: count,
        limit: plan.maxWorkspaces,
        upgradePlanId: plan.id === 'free' ? 'growth' : 'agency',
      }),
    };
  }
  return { ok: true, plan };
}

export async function checkCanConnectAccount(db, userId) {
  const { plan } = await getUserEntitlements(db, userId);
  const count = await db.collection('instagram_accounts').countDocuments({ connectedUserId: userId });
  if (count >= plan.maxAccounts) {
    return {
      ok: false,
      details: entitlementError({
        code: 'account_limit',
        message: `Your ${plan.name} plan includes ${plan.maxAccounts} Instagram account${plan.maxAccounts === 1 ? '' : 's'}. Upgrade to connect another account.`,
        plan,
        current: count,
        limit: plan.maxAccounts,
        upgradePlanId: plan.id === 'free' || plan.id === 'creator' ? 'growth' : 'agency',
      }),
    };
  }
  return { ok: true, plan };
}

export async function checkCanActivateAutomation(db, userId, workspaceId, excludeAutomationId = null) {
  const { plan } = await getUserEntitlements(db, userId);
  const query = { userId, workspaceId, isActive: true };
  if (excludeAutomationId) query._id = { $ne: excludeAutomationId };
  const count = await db.collection('automations').countDocuments(query);
  if (count >= plan.maxActiveAutomationsPerWorkspace) {
    return {
      ok: false,
      details: entitlementError({
        code: 'active_automation_limit',
        message: `Your ${plan.name} plan includes ${plan.maxActiveAutomationsPerWorkspace} active automations per workspace. Turn one off or upgrade.`,
        plan,
        current: count,
        limit: plan.maxActiveAutomationsPerWorkspace,
        upgradePlanId: plan.id === 'free' ? 'creator' : plan.id === 'creator' ? 'growth' : 'agency',
      }),
    };
  }
  return { ok: true, plan };
}

export async function tryConsumeTriggerQuota(db, userId, workspaceId, date = new Date()) {
  const { plan } = await getUserEntitlements(db, userId, date);
  const key = monthKey(date);
  const now = new Date();
  let result;
  try {
    result = await db.collection('usage_counters').findOneAndUpdate(
      {
        userId,
        workspaceId,
        month: key,
        triggersUsed: { $lt: plan.monthlyTriggersPerWorkspace },
      },
      {
        $setOnInsert: { _id: `${userId}:${workspaceId}:${key}`, userId, workspaceId, month: key, createdAt: now },
        $inc: { triggersUsed: 1 },
        $set: { updatedAt: now },
      },
      { upsert: true, returnDocument: 'after' },
    );
  } catch (e) {
    if (e?.code !== 11000) throw e;
    result = null;
  }
  const counter = result.value || result;
  if (!counter || counter.triggersUsed > plan.monthlyTriggersPerWorkspace) {
    const usage = await getWorkspaceUsage(db, userId, workspaceId, date);
    return {
      ok: false,
      plan,
      usage,
      details: entitlementError({
        code: 'trigger_limit',
        message: `This workspace reached the ${plan.name} plan limit of ${plan.monthlyTriggersPerWorkspace.toLocaleString('en-IN')} triggers for ${key}. Upgrade to keep automations running.`,
        plan,
        current: usage.triggersUsed,
        limit: plan.monthlyTriggersPerWorkspace,
        upgradePlanId: plan.id === 'free' ? 'creator' : plan.id === 'creator' ? 'growth' : 'agency',
      }),
    };
  }
  return {
    ok: true,
    plan,
    usage: { month: key, triggersUsed: counter.triggersUsed, updatedAt: counter.updatedAt },
  };
}
