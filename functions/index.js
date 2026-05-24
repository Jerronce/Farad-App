const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const geminiKey = defineSecret("GEMINI_API_KEY");
const flutterwaveSecret = defineSecret("FLUTTERWAVE_SECRET_KEY");
const flutterwaveEncryption = defineSecret("FLUTTERWAVE_ENCRYPTION_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function sendJson(res, status, payload) {
  Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));
  res.status(status).json(payload);
}

function handleOptions(req, res) {
  if (req.method === "OPTIONS") {
    Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));
    res.status(204).send("");
    return true;
  }
  return false;
}

async function callGemini(secretValue, model, payload) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${secretValue}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${text}`);
  }

  return response.json();
}

function getAiInstruction() {
  return [
    "You are Farad Fleet AI, an elite autonomous trip and fleet orchestration system.",
    "Speak warmly and intelligently.",
    "Always ask for missing operational details before dispatch if required.",
    "When enough data exists, return a practical route summary, clarifying questions, route logic, dispatch readiness, and fleet note.",
    "Driver prices are exact USD values from the database and payment only opens after arrival is confirmed."
  ].join(" ");
}

exports.fleetAiCommand = onRequest({ secrets: [geminiKey], cors: true }, async (req, res) => {
  if (handleOptions(req, res)) return;

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { prompt, history = [], tripDraft = {}, drivers = [] } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      sendJson(res, 400, { error: "Prompt is required." });
      return;
    }

    const payload = {
      systemInstruction: {
        parts: [{ text: getAiInstruction() }]
      },
      contents: [
        ...history.map((item) => ({
          role: item.role === "ai" ? "model" : "user",
          parts: [{ text: item.content }]
        })),
        {
          role: "user",
          parts: [
            {
              text: [
                `Operator command: ${prompt}`,
                `Trip draft: ${JSON.stringify(tripDraft, null, 2)}`,
                `Available drivers snapshot: ${JSON.stringify(drivers.slice(0, 6), null, 2)}`
              ].join("\n\n")
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.45,
        topP: 0.9,
        maxOutputTokens: 1000
      }
    };

    const data = await callGemini(geminiKey.value(), "gemini-1.5-pro", payload);
    const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n\n") || "";

    sendJson(res, 200, {
      source: "gemini",
      text
    });
  } catch (error) {
    logger.error(error);
    sendJson(res, 500, { error: error.message || "AI command failed." });
  }
});

exports.vehicleAudit = onRequest({ secrets: [geminiKey], cors: true }, async (req, res) => {
  if (handleOptions(req, res)) return;

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { fileBase64, mimeType, claimedVehicleType } = req.body || {};
    if (!fileBase64 || !mimeType) {
      sendJson(res, 400, { error: "Vehicle image payload is required." });
      return;
    }

    const payload = {
      systemInstruction: {
        parts: [
          {
            text: [
              "You are a strict Farad Fleet AI vehicle verification core.",
              "Verify that the image is a real vehicle photo.",
              "Estimate the model year.",
              "Vehicle must be 2020 or newer.",
              "Return JSON only with approved, estimatedYear, summary, reason."
            ].join(" ")
          }
        ]
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Declared vehicle type: ${claimedVehicleType || "unknown"}. Verify authenticity and model year.`
            },
            {
              inlineData: {
                mimeType,
                data: fileBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        maxOutputTokens: 300
      }
    };

    const data = await callGemini(geminiKey.value(), "gemini-1.5-pro", payload);
    const raw = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "{}";
    const parsed = JSON.parse(raw);
    const estimatedYear = Number(parsed.estimatedYear || 0);
    const approved = Boolean(parsed.approved) && estimatedYear >= 2020;

    sendJson(res, 200, {
      approved,
      year: estimatedYear || null,
      summary: parsed.summary || "Vehicle analysis completed.",
      reason: parsed.reason || (approved ? "approved" : "rejected")
    });
  } catch (error) {
    logger.error(error);
    sendJson(res, 500, { error: error.message || "Vehicle audit failed." });
  }
});

exports.createFlutterwavePayment = onRequest({ secrets: [flutterwaveSecret, flutterwaveEncryption], cors: true }, async (req, res) => {
  if (handleOptions(req, res)) return;

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const {
      amount,
      currency = "USD",
      customer,
      type,
      tripId,
      userId,
      redirectBase = "https://farad.web.app"
    } = req.body || {};

    if (!amount || !customer?.email || !type) {
      sendJson(res, 400, { error: "Amount, customer email, and payment type are required." });
      return;
    }

    const txRef = `farad-${type}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const redirectUrl = `${redirectBase.replace(/\/$/, "")}/api/payment/callback?type=${encodeURIComponent(type)}${tripId ? `&tripId=${encodeURIComponent(tripId)}` : ""}${userId ? `&userId=${encodeURIComponent(userId)}` : ""}`;

    const payload = {
      tx_ref: txRef,
      amount: Number(amount).toFixed(2),
      currency,
      redirect_url: redirectUrl,
      customer: {
        email: customer.email,
        name: customer.name || customer.email,
        phonenumber: customer.phonenumber || ""
      },
      customizations: {
        title: type === "subscription" ? "Farad Fleet AI Premium" : "Farad Trip Settlement",
        description: type === "subscription" ? "Prae Technologies premium access" : "Exact USD driver settlement",
        logo: `${redirectBase.replace(/\/$/, "")}/logo.png`
      },
      meta: {
        type,
        tripId: tripId || "",
        userId: userId || "",
        encryption_key_present: Boolean(flutterwaveEncryption.value())
      },
      payment_options: "card,banktransfer"
    };

    const response = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${flutterwaveSecret.value()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok || result?.status !== "success" || !result?.data?.link) {
      throw new Error(result?.message || "Flutterwave payment creation failed.");
    }

    sendJson(res, 200, {
      paymentLink: result.data.link,
      txRef
    });
  } catch (error) {
    logger.error(error);
    sendJson(res, 500, { error: error.message || "Payment creation failed." });
  }
});

exports.flutterwaveCallback = onRequest({ secrets: [flutterwaveSecret], cors: true }, async (req, res) => {
  try {
    const { status, transaction_id: transactionId, tx_ref: txRef, type, tripId, userId } = req.query;

    if (status !== "successful" || !transactionId) {
      res.redirect("https://farad.web.app/?payment=failed");
      return;
    }

    const verifyResponse = await fetch(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
      headers: {
        Authorization: `Bearer ${flutterwaveSecret.value()}`,
        "Content-Type": "application/json"
      }
    });

    const verification = await verifyResponse.json();
    if (!verifyResponse.ok || verification?.status !== "success") {
      throw new Error("Flutterwave verification failed.");
    }

    const paymentData = verification.data || {};

    if (type === "subscription" && userId) {
      await db.collection("users").doc(String(userId)).set(
        {
          subscription_status: "active",
          premium_access: {
            farad: true,
            praehire: true
          },
          lastPayment: {
            txRef,
            transactionId: String(transactionId),
            amount: paymentData.amount,
            currency: paymentData.currency,
            paidAt: admin.firestore.FieldValue.serverTimestamp()
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    if (type === "trip" && tripId) {
      const tripRef = db.collection("trips").doc(String(tripId));
      await tripRef.set(
        {
          paymentStatus: "paid",
          settledAmountUsd: paymentData.amount,
          settlement: {
            txRef,
            transactionId: String(transactionId),
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
            currency: paymentData.currency
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    res.redirect(`https://farad.web.app/?payment=success&type=${encodeURIComponent(type || "")}${tripId ? `&tripId=${encodeURIComponent(tripId)}` : ""}`);
  } catch (error) {
    logger.error(error);
    res.redirect("https://farad.web.app/?payment=failed");
  }
});
