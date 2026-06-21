import crypto from "node:crypto";
import * as Sentry from "@sentry/node";
import admin from "firebase-admin";
import {
  buildSubscriptionRecord,
  getPlan,
  validateFlutterwaveVerification
} from "../../lib/paymentVerification.js";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://praehire.com",
  "https://www.praehire.com",
  "https://farad.web.app",
  "https://prachat.web.app"
];
const MAX_JSON_PAYLOAD_BYTES = 64 * 1024;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 12;
const rateLimitStore = globalThis.__praePaymentRateLimitStore || new Map();
const firebaseApps = globalThis.__praeFirebaseAdminApps || new Map();
globalThis.__praePaymentRateLimitStore = rateLimitStore;
globalThis.__praeFirebaseAdminApps = firebaseApps;

if (process.env.SENTRY_DSN && !Sentry.getClient()) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
    tracesSampleRate: 0
  });
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "64kb"
    }
  }
};

function getAllowedOrigins() {
  const configured = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_ALLOWED_ORIGINS;
}

function isAllowedOrigin(origin) {
  return Boolean(origin) && getAllowedOrigins().includes(origin);
}

function setCors(req, res) {
  const origin = req.headers.origin || "";
  if (!isAllowedOrigin(origin)) return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Prae-Session");
  res.setHeader("Access-Control-Max-Age", "600");
  return true;
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value || "unknown")).digest("hex").slice(0, 16);
}

function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) return forwardedFor.split(",")[0].trim();
  return req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
}

function getSessionKey(req) {
  return `${hashValue(getClientIp(req))}:${hashValue(req.headers["x-prae-session"] || req.headers["user-agent"] || "")}`;
}

function checkRateLimit(key) {
  const now = Date.now();
  const current = rateLimitStore.get(key);
  if (!current || now > current.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }
  if (current.count >= RATE_LIMIT_MAX_REQUESTS) return { allowed: false, remaining: 0, resetAt: current.resetAt };
  current.count += 1;
  rateLimitStore.set(key, current);
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - current.count, resetAt: current.resetAt };
}

function sendRateHeaders(res, rate) {
  res.setHeader("X-RateLimit-Limit", String(RATE_LIMIT_MAX_REQUESTS));
  res.setHeader("X-RateLimit-Remaining", String(rate.remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(rate.resetAt / 1000)));
  if (!rate.allowed) res.setHeader("Retry-After", String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))));
}

function safeLog(req, event, details = {}) {
  console.warn(JSON.stringify({
    event,
    origin: req.headers.origin || "missing",
    ipHash: hashValue(getClientIp(req)),
    uaHash: hashValue(req.headers["user-agent"] || ""),
    ...details
  }));
}

function capturePaymentError(req, error, context = {}) {
  console.error(JSON.stringify({
    event: "payment_verification_error",
    origin: req.headers.origin || "missing",
    ipHash: hashValue(getClientIp(req)),
    name: error?.name || "Error",
    message: String(error?.message || "Unknown error").slice(0, 160),
    ...context
  }));
  Sentry.captureException(error, {
    tags: { area: "payment-verification", productTier: context.productTier || "unknown" }
  });
}

function hasValidContentType(req) {
  const type = String(req.headers["content-type"] || "").toLowerCase();
  return type === "application/json" || type.startsWith("application/json;");
}

function hasAllowedPayloadSize(req) {
  const contentLength = Number(req.headers["content-length"] || 0);
  return !contentLength || contentLength <= MAX_JSON_PAYLOAD_BYTES;
}

function parseServiceAccount(value) {
  if (!value) return null;
  const parsed = JSON.parse(value);
  if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  return parsed;
}

function getServiceAccountForApp(appKey) {
  const key = String(appKey || "").toUpperCase();
  const json =
    process.env[`${key}_FIREBASE_SERVICE_ACCOUNT_JSON`] ||
    (appKey === "prachat" ? process.env.PRACHAT_FIREBASE_SERVICE_ACCOUNT_JSON || process.env.PRAEHIRE_FIREBASE_SERVICE_ACCOUNT_JSON : "") ||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  return parseServiceAccount(json);
}

function getFirebaseAdmin(appKey) {
  const normalized = String(appKey || "default").toLowerCase();
  if (firebaseApps.has(normalized)) return firebaseApps.get(normalized);

  const serviceAccount = getServiceAccountForApp(normalized);
  if (!serviceAccount) {
    throw new Error(`Missing Firebase service account for ${normalized}.`);
  }

  const app = admin.initializeApp(
    {
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    },
    `prae-${normalized}-${firebaseApps.size}`
  );
  firebaseApps.set(normalized, app);
  return app;
}

async function verifyFirebaseToken(idToken, appKey) {
  const adminApp = getFirebaseAdmin(appKey);
  return admin.auth(adminApp).verifyIdToken(idToken);
}

async function verifyFlutterwaveTransaction(transactionId) {
  const secret = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!secret) throw new Error("Missing Flutterwave secret key.");

  const response = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json"
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Flutterwave verification failed with ${response.status}.`);
  }
  return body;
}

async function writeSubscription({ targetApp, userId, subscription }) {
  const adminApp = getFirebaseAdmin(targetApp);
  const db = admin.firestore(adminApp);
  const paymentRef = db.collection("payment_verifications").doc(subscription.flutterwaveTransactionId);
  const subscriptionRef = db.collection("subscriptions").doc(userId);
  const userRef = db.collection("users").doc(userId);
  const historyRef = subscriptionRef.collection("billing_history").doc(subscription.flutterwaveTransactionId);

  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(paymentRef);
    if (existing.exists) {
      const existingData = existing.data() || {};
      if (existingData.userId !== userId || existingData.productTier !== subscription.productTier) {
        throw new Error("Transaction has already been used for a different account or tier.");
      }
      return { duplicate: true, subscription: existingData.subscription || subscription };
    }

    const targetSubscription = {
      ...subscription,
      app: targetApp === "prachat" && subscription.app === "all" ? "all" : subscription.app,
      updatedAt: new Date().toISOString()
    };

    transaction.set(paymentRef, {
      userId,
      productTier: subscription.productTier,
      app: subscription.app,
      status: "verified",
      subscription: targetSubscription,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    transaction.set(subscriptionRef, targetSubscription, { merge: true });
    transaction.set(historyRef, targetSubscription, { merge: true });
    transaction.set(userRef, {
      subscription: targetSubscription,
      productTier: subscription.productTier,
      subscription_status: "active",
      premium_access: {
        praehire: subscription.productTier === "praehire_pro" || subscription.productTier === "ecosystem_pass",
        farad: subscription.productTier === "farad_enterprise" || subscription.productTier === "ecosystem_pass",
        prachat: subscription.productTier === "prachat_care" || subscription.productTier === "ecosystem_pass"
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { duplicate: false, subscription: targetSubscription };
  });
}

function validateRequestBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Payload must be a JSON object.";
  if (typeof body.transactionId !== "string" && typeof body.txRef !== "string") return "transactionId is required.";
  if (typeof body.productTier !== "string" || !getPlan(body.productTier)) return "A valid productTier is required.";
  if (typeof body.userId !== "string" || !body.userId.trim()) return "userId is required.";
  return null;
}

export default async function handler(req, res) {
  const corsAllowed = setCors(req, res);
  if (!corsAllowed) {
    safeLog(req, "payment_origin_rejected");
    return res.status(403).json({ ok: false, error: "Origin is not allowed." });
  }

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed. Use POST." });

  try {
    if (!hasValidContentType(req)) return res.status(415).json({ ok: false, error: "Content-Type must be application/json." });
    if (!hasAllowedPayloadSize(req)) return res.status(413).json({ ok: false, error: "Payload is too large." });

    const rate = checkRateLimit(getSessionKey(req));
    sendRateHeaders(res, rate);
    if (!rate.allowed) return res.status(429).json({ ok: false, error: "Too many verification attempts. Please wait." });

    const body = req.body || {};
    const bodyError = validateRequestBody(body);
    if (bodyError) return res.status(400).json({ ok: false, error: bodyError });

    const authHeader = String(req.headers.authorization || "");
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!idToken) return res.status(401).json({ ok: false, error: "Authentication is required." });

    const plan = getPlan(body.productTier);
    const tokenApp = plan.productTier === "farad_enterprise" ? "farad" : plan.productTier === "prachat_care" ? "prachat" : "praehire";
    const decoded = await verifyFirebaseToken(idToken, tokenApp);
    if (decoded.uid !== body.userId) return res.status(403).json({ ok: false, error: "Authenticated user mismatch." });

    const flutterwaveTransaction = await verifyFlutterwaveTransaction(body.transactionId);
    const validation = validateFlutterwaveVerification({
      requestedUserId: body.userId,
      requestedProductTier: body.productTier,
      transaction: flutterwaveTransaction
    });
    if (!validation.ok) {
      safeLog(req, "payment_validation_failed", { productTier: body.productTier, reason: validation.error });
      return res.status(validation.status).json({ ok: false, error: validation.error });
    }

    const subscription = buildSubscriptionRecord({
      userId: body.userId,
      plan,
      flutterwaveTransactionId: body.transactionId,
      txRef: body.txRef || flutterwaveTransaction?.data?.tx_ref || ""
    });

    const writes = [];
    for (const targetApp of plan.targetApps) {
      writes.push(await writeSubscription({ targetApp, userId: body.userId, subscription }));
    }

    return res.status(200).json({
      ok: true,
      status: writes.some((item) => item.duplicate) ? "duplicate_verified" : "verified",
      subscription
    });
  } catch (error) {
    capturePaymentError(req, error, { productTier: req.body?.productTier });
    const message = String(error?.message || "");
    if (message.includes("already been used")) return res.status(409).json({ ok: false, error: "This transaction was already used." });
    if (message.includes("Missing")) return res.status(503).json({ ok: false, error: "Payment verification is not configured yet." });
    return res.status(500).json({ ok: false, error: "Payment could not be verified right now." });
  }
}
