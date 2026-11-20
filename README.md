# Recipe Taker

Share an Instagram Reel or YouTube Short to the app (or paste its link, or upload a video) and get every recipe in it: ingredients and steps, in the video's own language plus an English translation.

Google Gemini watches the video. It listens to the speech in any language, reads on-screen text, sees what goes into the pan, and also reads the post caption.

```
mobile/   Expo (React Native) app: iOS, Android and the web version, from one codebase
backend/  FastAPI server: downloads the video (yt-dlp), asks Gemini for structured recipes, and serves the website
Dockerfile  Website + API in one container
```

## 1. Run the backend

You need a Gemini API key from https://aistudio.google.com/apikey.

```bash
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
export GEMINI_API_KEY=your-key
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Try it:

```bash
curl -s localhost:8000/extract -H 'content-type: application/json' \
  -d '{"url":"https://youtube.com/shorts/VIDEO_ID"}' | python3 -m json.tool
```

Tests: `pytest`

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Required |
| `GEMINI_MODEL` | Override the model (default `gemini-3.8-flash`) |
| `GEMINI_FALLBACK_MODEL` | Model to try when the main one is overloaded (default `gemini-3.5-flash`) |
| `GEMINI_THINKING_LEVEL` | `LOW` by default (faster); `MEDIUM`/`HIGH` for tricky videos |
| `APP_TOKEN` | If set, the app must send it as `X-App-Token`. Set this once the server is public, so others can't use your Gemini quota |
| `YTDLP_COOKIES_FILE` | A `cookies.txt` from a logged-in browser. Helps when Instagram demands a login |

**Deploying:** `backend/Dockerfile` runs on Render, Fly.io, Railway or Google Cloud Run. Set the variables above in the host's dashboard.

### About Instagram
Instagram often blocks anonymous downloads, especially from cloud servers. If you get "Instagram blocked the download", you can:
- set `YTDLP_COOKIES_FILE`, or run the backend from a home connection, or
- save the reel to your phone and share the **video file** to Recipe Taker. File uploads always work.

YouTube is read directly by Gemini from the URL, so it doesn't need a download (YouTube often blocks yt-dlp on cloud servers; the title and thumbnail then come from YouTube's oEmbed instead).

Expect 30–120 seconds per video: Gemini writes the recipe twice (original language + English).

## 2. Web version

The same app runs in a browser. Recipes are saved in that browser.

**Deploy the website and API together** (Render, Fly.io, Railway, Cloud Run…) with the root `Dockerfile`:
```bash
docker build -t recipe-taker .
docker run -p 8000:8000 -e GEMINI_API_KEY=your-key recipe-taker
# open http://localhost:8000
```

**Share from Android without the native app:** open the site in Chrome, use the menu to **Add to Home screen / Install**. "Recipe Taker" then shows up in Android's share sheet (Web Share Target). iPhone browsers don't support sharing into websites, so on iPhone paste the link or use the native app.

**Developing the web UI:** run the backend on port 8000, then `cd mobile && npx expo start --web`.

## 3. Run the phone app

The share-sheet target is native code, so the app needs a **development build**. Expo Go won't work.

```bash
cd mobile
npm install
cp .env.example .env    # set EXPO_PUBLIC_API_URL to your computer's LAN IP, e.g. http://192.168.1.20:8000
```

**Android** (phone connected over USB, or an emulator):
```bash
npx expo run:android
```

**iPhone** (needs a Mac with Xcode, or EAS cloud builds with an Apple Developer account):
```bash
npx expo run:ios --device
# or, without a Mac:
npx eas-cli@latest build --profile development --platform ios
```
On iOS, select your Apple team for both the `RecipeTaker` and `ShareExtension` targets. The app uses the App Group `group.com.recipetaker.app`. If you change the bundle identifier in `app.json`, the group changes to match.

You can also change the server address in the app itself, under **Settings**.

## How to use
- **Share:** in Instagram or YouTube, tap **Share**, then **Recipe Taker**. On Instagram you may need to tap **More** or "…" the first time.
- **Paste:** copy the link, open the app and tap **Paste link & go**.
- **Upload:** tap **Upload video** and choose a saved reel.

Recipes are saved on the phone (SQLite). You can search them by dish or ingredient. Each recipe has an original-language / English toggle, ingredient checkboxes, and step timestamps that jump to that point in the YouTube video.
