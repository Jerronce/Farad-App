import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSubscriptionRecord,
  validateFlutterwaveVerification
} from "../lib/paymentVerification.js";

function tx(overrides = {}) {
  return {
    data: {
      status: "successful",
      amount: 9,
      currency: "USD",
      tx_ref: "praehire_pro-123",
      meta: {
        productTier: "praehire_pro",
        userId: "user_123"
      },
      ...overrides
    }
  };
}

test("accepts a successful matching PraeHire Pro transaction", () => {
  const result = validateFlutterwaveVerification({
    requestedUserId: "user_123",
    requestedProductTier: "praehire_pro",
    transaction: tx()
  });
  assert.equal(result.ok, true);
  assert.equal(result.plan.amount, 9);
});

test("rejects failed payments", () => {
  const result = validateFlutterwaveVerification({
    requestedUserId: "user_123",
    requestedProductTier: "praehire_pro",
    transaction: tx({ status: "failed" })
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 402);
});

test("rejects wrong amount", () => {
  const result = validateFlutterwaveVerification({
    requestedUserId: "user_123",
    requestedProductTier: "praehire_pro",
    transaction: tx({ amount: 19 })
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /amount/i);
});

test("rejects wrong currency", () => {
  const result = validateFlutterwaveVerification({
    requestedUserId: "user_123",
    requestedProductTier: "praehire_pro",
    transaction: tx({ currency: "NGN" })
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /currency/i);
});

test("rejects wrong product tier metadata", () => {
  const result = validateFlutterwaveVerification({
    requestedUserId: "user_123",
    requestedProductTier: "praehire_pro",
    transaction: tx({ meta: { productTier: "ecosystem_pass", userId: "user_123" } })
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /metadata/i);
});

test("rejects wrong metadata user", () => {
  const result = validateFlutterwaveVerification({
    requestedUserId: "user_123",
    requestedProductTier: "praehire_pro",
    transaction: tx({ meta: { productTier: "praehire_pro", userId: "other_user" } })
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test("builds monthly subscription record with expiry", () => {
  const now = new Date("2026-06-21T00:00:00.000Z");
  const record = buildSubscriptionRecord({
    userId: "user_123",
    plan: { productTier: "prachat_care", app: "prachat", amount: 14, currency: "USD", billingCycle: "monthly" },
    flutterwaveTransactionId: "111",
    txRef: "prachat_care-111",
    now
  });
  assert.equal(record.status, "active");
  assert.equal(record.currency, "USD");
  assert.equal(record.expiresAt, "2026-07-21T00:00:00.000Z");
});
