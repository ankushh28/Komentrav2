export const DEFAULT_PLAN_ID = 'free';

export const PLAN_IDS = ['free', 'creator', 'growth', 'agency'];

export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    priceInr: 0,
    description: 'Free forever for early creators.',
    maxWorkspaces: 1,
    maxAccounts: 1,
    maxActiveAutomationsPerWorkspace: 10,
    monthlyTriggersPerWorkspace: 1200,
    analyticsLookbackDays: 7,
    audienceVisibleLimit: 100,
    canExportAudience: false,
    canUseShortsSync: false,
    supportLevel: 'standard',
    razorpayPlanEnv: null,
  },
  creator: {
    id: 'creator',
    name: 'Creator',
    priceInr: 349,
    description: 'For one serious creator account.',
    maxWorkspaces: 1,
    maxAccounts: 1,
    maxActiveAutomationsPerWorkspace: 20,
    monthlyTriggersPerWorkspace: 2000,
    analyticsLookbackDays: 30,
    audienceVisibleLimit: 2000,
    canExportAudience: true,
    canUseShortsSync: true,
    supportLevel: 'standard',
    razorpayPlanEnv: 'RAZORPAY_PLAN_CREATOR_ID',
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    priceInr: 999,
    description: 'For creators and brands running multiple campaigns.',
    maxWorkspaces: 3,
    maxAccounts: 3,
    maxActiveAutomationsPerWorkspace: 30,
    monthlyTriggersPerWorkspace: 25000,
    analyticsLookbackDays: 90,
    audienceVisibleLimit: 10000,
    canExportAudience: true,
    canUseShortsSync: true,
    supportLevel: 'priority',
    razorpayPlanEnv: 'RAZORPAY_PLAN_GROWTH_ID',
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    priceInr: 2999,
    description: 'For managing client workspaces.',
    maxWorkspaces: 10,
    maxAccounts: 10,
    maxActiveAutomationsPerWorkspace: 50,
    monthlyTriggersPerWorkspace: 75000,
    analyticsLookbackDays: 365,
    audienceVisibleLimit: 50000,
    canExportAudience: true,
    canUseShortsSync: true,
    supportLevel: 'priority',
    razorpayPlanEnv: 'RAZORPAY_PLAN_AGENCY_ID',
  },
};

export function getPlan(planId = DEFAULT_PLAN_ID) {
  return PLANS[planId] || PLANS[DEFAULT_PLAN_ID];
}

export function isPaidPlan(planId) {
  return planId && planId !== DEFAULT_PLAN_ID && !!PLANS[planId];
}

export function publicPlan(plan) {
  const p = getPlan(plan?.id || plan);
  return {
    id: p.id,
    name: p.name,
    priceInr: p.priceInr,
    description: p.description,
    maxWorkspaces: p.maxWorkspaces,
    maxAccounts: p.maxAccounts,
    maxActiveAutomationsPerWorkspace: p.maxActiveAutomationsPerWorkspace,
    monthlyTriggersPerWorkspace: p.monthlyTriggersPerWorkspace,
    analyticsLookbackDays: p.analyticsLookbackDays,
    audienceVisibleLimit: p.audienceVisibleLimit,
    canExportAudience: p.canExportAudience,
    canUseShortsSync: p.canUseShortsSync,
    supportLevel: p.supportLevel,
  };
}

export function publicPlans() {
  return PLAN_IDS.map(id => publicPlan(id));
}
