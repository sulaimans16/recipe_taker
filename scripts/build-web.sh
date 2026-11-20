#!/usr/bin/env bash
# Rebuild the web app into public/ (served by Vercel's CDN). Run after changing anything in mobile/, then commit public/.
set -euo pipefail
cd "$(dirname "$0")/../mobile"
npm ci
rm -rf ../public
npx expo export --platform web --output-dir ../public
cp ../public/index.html ../backend/app/web_index.html
