# Prae AI Proxy

Free Vercel serverless proxy for PraeHire, Farad AI, and PraChat/Mexty.

## Environment Variables

Set these in Vercel Project Settings -> Environment Variables:

- `AI_SECRET_KEY`: your Gemini API key.
- `GEMINI_MODEL`: optional, defaults to `gemini-2.5-flash`.
- `ALLOWED_ORIGINS`: optional comma-separated list of frontend origins.
- `FLUTTERWAVE_SECRET_KEY`: Flutterwave secret key. Keep this only in Vercel env vars.
- `FARAD_FIREBASE_SERVICE_ACCOUNT_JSON`: service-account JSON for `farad-5bc61`.
- `PRAEHIRE_FIREBASE_SERVICE_ACCOUNT_JSON`: service-account JSON for `praehire-ai`.
- `PRACHAT_FIREBASE_SERVICE_ACCOUNT_JSON`: service-account JSON for PraChat. If PraChat shares `praehire-ai`, this can match the PraeHire service account.
- `SENTRY_DSN`: optional backend Sentry DSN for safe payment verification errors.

## Endpoint

After deployment, the dashboards should call:

```txt
https://YOUR-VERCEL-PROJECT.vercel.app/api/ai/process
```

The Firebase frontends never receive `AI_SECRET_KEY`; they only send prompts to this proxy.

## Payment Verification Endpoint

The production payment verifier is:

```txt
https://YOUR-VERCEL-PROJECT.vercel.app/api/payments/verify
```

Clients must call it after Flutterwave checkout returns a transaction ID. The request must include:

- `Authorization: Bearer <Firebase ID token>`
- JSON body with `transactionId`, `txRef`, `productTier`, and `userId`

The backend verifies with Flutterwave using `FLUTTERWAVE_SECRET_KEY`, checks exact USD amount/currency/tier/user metadata, and only then writes an active subscription record to Firestore.

Supported tiers:

- `praehire_pro`: `$9 USD/month`
- `farad_enterprise`: `$29 USD/month`
- `prachat_care`: `$14 USD/month`
- `ecosystem_pass`: `$19 USD/month`

Ecosystem Pass writes active access to PraeHire, Farad AI, and PraChat when all corresponding Firebase service-account env vars are configured.
