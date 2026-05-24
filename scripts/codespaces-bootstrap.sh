#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Farad Fleet AI Codespaces bootstrap starting..."

GEMINI_KEY="${VITE_GEMINI_API_KEY:-}"
if [[ -z "$GEMINI_KEY" ]]; then
  read -r -p "Paste your Google AI Studio Gemini API key: " GEMINI_KEY
fi

if [[ "${PERSIST_ENV:-0}" == "1" ]]; then
  cat > .env.local <<EOF
VITE_GEMINI_API_KEY=${GEMINI_KEY}
VITE_GEMINI_MODEL=gemini-1.5-pro
VITE_FIREBASE_AUTH_DOMAIN=farad-5bc61.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=farad-5bc61
VITE_FIREBASE_STORAGE_BUCKET=farad-5bc61.firebasestorage.app
VITE_FARAD_REGION=africa-west1
EOF
  echo "Saved .env.local because PERSIST_ENV=1 was supplied."
fi

npm install
VITE_GEMINI_API_KEY="$GEMINI_KEY" VITE_GEMINI_MODEL="gemini-1.5-pro" npm run build

echo

echo "Farad Fleet AI is ready."
echo "Run: npm run dev"
echo "Deploy: npm run deploy"
