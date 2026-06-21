export const PLAN_CATALOG = Object.freeze({
  praehire_pro: {
    productTier: "praehire_pro",
    app: "praehire",
    amount: 9,
    currency: "USD",
    billingCycle: "monthly",
    targetApps: ["praehire"]
  },
  farad_enterprise: {
    productTier: "farad_enterprise",
    app: "farad",
    amount: 29,
    currency: "USD",
    billingCycle: "monthly",
    targetApps: ["farad"]
  },
  prachat_care: {
    productTier: "prachat_care",
    app: "prachat",
    amount: 14,
    currency: "USD",
    billingCycle: "monthly",
    targetApps: ["prachat"]
  },
  ecosystem_pass: {
    productTier: "ecosystem_pass",
    app: "all",
    amount: 19,
    currency: "USD",
    billingCycle: "monthly",
    targetApps: ["praehire", "farad", "prachat"]
  }
});

export function normalizeMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function getPlan(productTier) {
  return PLAN_CATALOG[String(productTier || "").trim()] || null;
}

export function buildSubscriptionRecord({
  userId,
  plan,
  flutterwaveTransactionId,
  txRef,
  status = "active",
  now = new Date()
}) {
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  return {
    userId,
    productTier: plan.productTier,
    app: plan.app,
    currency: plan.currency,
    amount: plan.amount,
    billingCycle: plan.billingCycle,
    status,
    flutterwaveTransactionId: String(flutterwaveTransactionId || ""),
    txRef: String(txRef || ""),
    createdAt,
    updatedAt: createdAt,
    expiresAt
  };
}

export function validateFlutterwaveVerification({ requestedUserId, requestedProductTier, transaction }) {
  const plan = getPlan(requestedProductTier);
  if (!plan) return { ok: false, status: 400, error: "Unknown product tier." };

  const data = transaction?.data || transaction || {};
  const meta = data.meta || data.metadata || {};
  const status = String(data.status || "").toLowerCase();
  const currency = String(data.currency || "").toUpperCase();
  const amount = normalizeMoney(data.amount);
  const metaProductTier = String(meta.productTier || meta.product_tier || "").trim();
  const metaUserId = String(meta.userId || meta.user_id || "").trim();

  if (status !== "successful") {
    return { ok: false, status: 402, error: "Payment was not successful." };
  }

  if (currency !== plan.currency) {
    return { ok: false, status: 400, error: "Payment currency does not match the selected plan." };
  }

  if (amount !== normalizeMoney(plan.amount)) {
    return { ok: false, status: 400, error: "Payment amount does not match the selected plan." };
  }

  if (metaProductTier !== plan.productTier) {
    return { ok: false, status: 400, error: "Payment plan metadata does not match." };
  }

  if (metaUserId !== requestedUserId) {
    return { ok: false, status: 403, error: "Payment user metadata does not match." };
  }

  return { ok: true, plan };
}
