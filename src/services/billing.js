export const MONTHLY_PLAN_USD = 149;

export function hasActivePremium(userRecord) {
  return Boolean(
    userRecord?.subscription_status === "active" ||
      userRecord?.premium_access?.praehire === true ||
      userRecord?.premium_access?.farad === true
  );
}

async function createPaymentLink(payload) {
  const response = await fetch("/api/payment/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Payment link creation failed.");
  }

  return data;
}

function launchHostedPayment(link) {
  window.location.href = link;
}

export async function openSubscriptionCheckout({ user }) {
  const result = await createPaymentLink({
    amount: MONTHLY_PLAN_USD,
    currency: "USD",
    type: "subscription",
    userId: user.uid,
    customer: {
      email: user.email,
      name: user.displayName || user.email
    },
    redirectBase: window.location.origin
  });

  launchHostedPayment(result.paymentLink);
}

export async function openTripSettlementCheckout({ user, driver, amountUsd, tripId }) {
  const result = await createPaymentLink({
    amount: amountUsd,
    currency: "USD",
    type: "trip",
    tripId,
    userId: user.uid,
    customer: {
      email: user.email,
      name: user.displayName || user.email,
      phonenumber: driver.contact?.phone || ""
    },
    redirectBase: window.location.origin
  });

  launchHostedPayment(result.paymentLink);
}
