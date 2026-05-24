# Farad Fleet AI

Farad Fleet AI is a premium autonomous mobility and decentralized driver marketplace built for GitHub Codespaces and Firebase Hosting on `farad.web.app`.

## Stack

- Vite web app
- Firebase Authentication, Firestore, and Storage
- Google AI Studio Gemini conversation and vehicle-audit wrappers
- Flutterwave checkout wrapper for premium access and driver settlement in USD

## Codespaces bootstrap

```bash
chmod +x scripts/codespaces-bootstrap.sh
./scripts/codespaces-bootstrap.sh
```

That script prompts once for your Gemini key, installs dependencies, and runs a production build without hardcoding the key into the repository.

To persist local build env values in the workspace, run:

```bash
PERSIST_ENV=1 ./scripts/codespaces-bootstrap.sh
```

## Required environment values

Copy `.env.example` into `.env.local` and set the real values for:

- `VITE_GEMINI_API_KEY`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FLUTTERWAVE_PUBLIC_KEY`

## Deploy

```bash
npm run deploy
```

The app builds into `dist/` and deploys to the existing Firebase Hosting site configured for `farad.web.app`.
