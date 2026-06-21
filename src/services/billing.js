export const PLAN_NAME = "Farad AI Enterprise";
export const PRODUCT_TIER = "farad_enterprise";
export const ECOSYSTEM_TIER = "ecosystem_pass";
export const MONTHLY_PLAN_USD = 29;
export const ECOSYSTEM_PLAN_USD = 19;
export const FLUTTERWAVE_PUBLIC_KEY = "FLWPUBK-16a72bd54f4eb876e6a705d899b049d8-X";

const FLUTTERWAVE_SCRIPT_SRC = "https://checkout.flutterwave.com/v3.js";
const PAYMENT_VERIFY_URL =
  window.env?.PAYMENT_VERIFY_URL ||
  window.env?.VITE_PAYMENT_VERIFY_URL ||
  "https://vercel-ai-proxy-omega.vercel.app/api/payments/verify";

export function hasActivePremium(userRecord) {
  const tier = userRecord?.productTier || userRecord?.subscription?.productTier || userRecord?.subscriptionTier;
  const app = userRecord?.app || userRecord?.subscription?.app;
  return Boolean(
    tier === PRODUCT_TIER ||
      tier === ECOSYSTEM_TIER ||
      app === "all" ||
    userRecord?.subscription_status === "active" ||
      userRecord?.status === "active" ||
      userRecord?.premium_access?.praehire === true ||
      userRecord?.premium_access?.farad === true
  );
}

export function buildSubscriptionRecord({
  userId = "",
  productTier = PRODUCT_TIER,
  app = "farad",
  amount = MONTHLY_PLAN_USD,
  status = "pending",
  flutterwaveTransactionId = "",
  txRef = ""
} = {}) {
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  return {
    userId,
    productTier,
    app,
    currency: "USD",
    amount,
    billingCycle: "monthly",
    status,
    flutterwaveTransactionId,
    txRef,
    createdAt: nowIso,
    updatedAt: nowIso,
    expiresAt
  };
}

function buildReturnUrl(params) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

function loadFlutterwaveScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Flutterwave checkout is only available in the browser."));
  }

  if (window.FlutterwaveCheckout) {
    return Promise.resolve(window.FlutterwaveCheckout);
  }

  const existingScript = document.querySelector(`script[src="${FLUTTERWAVE_SCRIPT_SRC}"]`);
  if (existingScript) {
    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        reject(new Error("Flutterwave checkout is taking too long to load. Please try again."));
      }, 12000);
      existingScript.addEventListener(
        "load",
        () => {
          window.clearTimeout(timeoutId);
          resolve(window.FlutterwaveCheckout);
        },
        { once: true }
      );
      existingScript.addEventListener(
        "error",
        () => {
          window.clearTimeout(timeoutId);
          reject(new Error("Flutterwave checkout could not be loaded."));
        },
        { once: true }
      );
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      reject(new Error("Flutterwave checkout is taking too long to load. Please try again."));
    }, 12000);
    script.src = FLUTTERWAVE_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timeoutId);
      resolve(window.FlutterwaveCheckout);
    };
    script.onerror = () => {
      window.clearTimeout(timeoutId);
      reject(new Error("Flutterwave checkout could not be loaded."));
    };
    document.head.appendChild(script);
  });
}

async function openFlutterwaveModal(config) {
  const FlutterwaveCheckout = await loadFlutterwaveScript();
  if (typeof FlutterwaveCheckout !== "function") {
    throw new Error("Flutterwave checkout is not ready yet. Please try again.");
  }
  FlutterwaveCheckout(config);
}

async function verifySubscriptionPayment({ transactionId, txRef, productTier, userId, idToken }) {
  if (!transactionId) {
    throw new Error("Flutterwave did not return a transaction ID for verification.");
  }

  if (!userId || !idToken) {
    throw new Error("Sign in again before verifying this payment.");
  }

  const response = await fetch(PAYMENT_VERIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify({
      transactionId: String(transactionId),
      txRef: String(txRef || ""),
      productTier,
      userId
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) {
    throw new Error(data?.error || "Payment verification failed. Your free access remains active.");
  }
  return data;
}

export async function openSubscriptionCheckout({
  email = "",
  name = "Farad Member",
  role = "user",
  productTier = PRODUCT_TIER,
  userId = "",
  idToken = ""
} = {}) {
  const emailValue = String(email || "").trim();
  const displayName = String(name || "").trim() || "Farad Member";
  const roleValue = role === "driver" ? "driver" : "user";
  const ecosystem = productTier === ECOSYSTEM_TIER;
  const planName = ecosystem ? "Prae Ecosystem Pass" : PLAN_NAME;
  const amount = ecosystem ? ECOSYSTEM_PLAN_USD : MONTHLY_PLAN_USD;
  const app = ecosystem ? "all" : "farad";
  const txRef = `${productTier}-${Date.now()}`;

  await openFlutterwaveModal({
    public_key: FLUTTERWAVE_PUBLIC_KEY,
    tx_ref: txRef,
    amount,
    currency: "USD",
    payment_options: "card,banktransfer,ussd",
    meta: {
      productTier,
      app,
      billingCycle: "monthly",
      status: "pending",
      source: "farad"
    },
    customer: {
      email: emailValue || "support@farad.ai",
      name: displayName
    },
    customizations: {
      title: planName,
      description: `${planName} monthly USD access`,
      logo: `${window.location.origin}/logo.png`
    },
    async callback(response) {
      const success = response?.status === "successful" || response?.status === "completed" || Boolean(response?.transaction_id);
      if (!success) {
        window.location.href = buildReturnUrl({
          payment: "failed",
          type: "subscription",
          productTier,
          app,
          amount,
          email: emailValue,
          role: roleValue,
          tx_ref: response?.tx_ref || txRef,
          transaction_id: response?.transaction_id || ""
        });
        return;
      }

      window.dispatchEvent(new CustomEvent("farad-payment-verifying", { detail: { productTier, txRef } }));
      try {
        await verifySubscriptionPayment({
          transactionId: response?.transaction_id,
          txRef: response?.tx_ref || txRef,
          productTier,
          userId,
          idToken
        });
        window.location.href = buildReturnUrl({
          payment: "success",
          verified: "true",
          type: "subscription",
          productTier,
          app,
          amount,
          email: emailValue,
          role: roleValue,
          tx_ref: response?.tx_ref || txRef,
          transaction_id: response?.transaction_id || ""
        });
      } catch (error) {
        window.dispatchEvent(new CustomEvent("farad-payment-verification-failed", { detail: { message: error.message } }));
        window.location.href = buildReturnUrl({
          payment: "failed",
          verified: "false",
          type: "subscription",
          productTier,
          app,
          amount,
          email: emailValue,
          role: roleValue,
          tx_ref: response?.tx_ref || txRef,
          transaction_id: response?.transaction_id || ""
        });
      }
    },
    onclose() {
      window.dispatchEvent(new CustomEvent("farad-payment-closed", { detail: { type: "subscription", txRef } }));
    }
  });
}

export async function openTripSettlementCheckout({ user, driver, amountUsd, tripId }) {
  const txRef = `farad-trip-${tripId || Date.now()}`;
  const riderName = user?.displayName || user?.email || "Farad Rider";
  const riderEmail = user?.email || "support@farad.ai";
  const exactAmountUsd = Number(amountUsd || 0);

  if (!exactAmountUsd || exactAmountUsd <= 0) {
    throw new Error("The exact USD driver fare is missing. Refresh the trip before payment.");
  }

  await openFlutterwaveModal({
    public_key: FLUTTERWAVE_PUBLIC_KEY,
    tx_ref: txRef,
    amount: exactAmountUsd,
    currency: "USD",
    payment_options: "card,banktransfer,ussd",
    customer: {
      email: riderEmail,
      name: riderName,
      phonenumber: driver?.contact?.phone || driver?.phone || ""
    },
    customizations: {
      title: "Farad AI Driver Settlement",
      description: `Driver settlement for trip ${tripId || ""}`.trim(),
      logo: `${window.location.origin}/logo.png`
    },
    callback(response) {
      const success = response?.status === "successful" || Boolean(response?.transaction_id);
      window.location.href = buildReturnUrl({
        payment: success ? "success" : "failed",
        type: "trip",
        tripId: tripId || "",
        tx_ref: response?.tx_ref || txRef,
        transaction_id: response?.transaction_id || ""
      });
    },
    onclose() {}
  });
}
