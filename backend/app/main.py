"""Recipe Taker API."""

from __future__ import annotations

import asyncio
import logging
import os
import secrets
import shutil
import tempfile
from collections import OrderedDict
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from . import sources
from .gemini import GeminiError, RecipeExtractor
from .schema import ExtractRequest, ExtractResponse

log = logging.getLogger("recipe_taker")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Recipe Taker API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

REQUEST_TIMEOUT = float(os.environ.get("REQUEST_TIMEOUT_SEC", 300))
_CACHE_MAX = 200
_cache: "OrderedDict[str, ExtractResponse]" = OrderedDict()
_extractor: Optional[RecipeExtractor] = None


def get_extractor() -> RecipeExtractor:
    global _extractor
    if _extractor is None:
        _extractor = RecipeExtractor()
    return _extractor


def check_token(x_app_token: Optional[str] = Header(default=None)) -> None:
    """If APP_TOKEN is set, require it so strangers can't spend your Gemini quota."""
    expected = os.environ.get("APP_TOKEN")
    if expected and not (x_app_token and secrets.compare_digest(x_app_token, expected)):
        raise HTTPException(status_code=401, detail="Invalid app token.")


def _cache_put(key: str, value: ExtractResponse) -> None:
    _cache[key] = value
    _cache.move_to_end(key)
    while len(_cache) > _CACHE_MAX:
        _cache.popitem(last=False)


def _respond(src: sources.VideoSource, result, url: Optional[str]) -> ExtractResponse:
    return ExtractResponse(
        **result.model_dump(),
        source_url=url,
        platform=src.platform,  # type: ignore[arg-type]
        source_title=src.title,
        author=src.author,
        thumbnail_url=src.thumbnail_url,
    )


def _extract_from_url(url: str, extractor: RecipeExtractor) -> ExtractResponse:
    platform = sources.detect_platform(url)
    canonical = sources.normalize_url(url)

    if platform == "youtube":
        # Metadata is best-effort: Gemini reads YouTube directly.
        try:
            src = sources.fetch_metadata(canonical)
        except sources.SourceError as err:
            if "limit is" in str(err):
                raise
            log.warning("YouTube metadata via yt-dlp failed (%s); using oEmbed", str(err)[:120])
            src = sources.youtube_oembed(canonical) or sources.VideoSource(url=canonical, platform="youtube")
        try:
            result = extractor.from_youtube_url(canonical, src.caption_context())
            return _respond(src, result, canonical)
        except GeminiError as err:
            if "busy" in str(err):
                raise  # downloading won't help when Gemini itself is overloaded
            log.warning("Direct YouTube read failed (%s); downloading instead", err)

    workdir = Path(tempfile.mkdtemp(prefix="recipe_"))
    try:
        src = sources.download_video(canonical, workdir)
        assert src.file_path is not None
        result = extractor.from_file(src.file_path, src.mime_type, src.caption_context())
        return _respond(src, result, canonical)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


async def _run(fn, *args):
    try:
        return await asyncio.wait_for(asyncio.to_thread(fn, *args), timeout=REQUEST_TIMEOUT)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Reading the video took too long. Please try again.")
    except sources.SourceError as err:
        raise HTTPException(status_code=422, detail=str(err))
    except GeminiError as err:
        log.exception("Gemini error")
        raise HTTPException(status_code=502, detail=str(err))


@app.get("/api/health")
@app.get("/health", include_in_schema=False)
def health() -> dict:
    sha = os.environ.get("VERCEL_GIT_COMMIT_SHA", "")
    return {"ok": True, **({"version": sha[:7]} if sha else {})}


@app.post("/api/extract", response_model=ExtractResponse, dependencies=[Depends(check_token)])
@app.post("/extract", response_model=ExtractResponse, dependencies=[Depends(check_token)], include_in_schema=False)
async def extract(req: ExtractRequest, refresh: bool = False) -> ExtractResponse:
    url = sources.extract_url(req.url or "") or sources.extract_url(req.text or "")
    if not url:
        raise HTTPException(status_code=400, detail="No link found. Paste an Instagram or YouTube link.")
    key = sources.normalize_url(url)
    if not refresh and key in _cache:
        return _cache[key]
    try:
        extractor = get_extractor()
    except GeminiError as err:
        raise HTTPException(status_code=500, detail=str(err))
    resp = await _run(_extract_from_url, url, extractor)
    _cache_put(key, resp)
    return resp


@app.post("/api/extract/upload", response_model=ExtractResponse, dependencies=[Depends(check_token)])
@app.post("/extract/upload", response_model=ExtractResponse, dependencies=[Depends(check_token)], include_in_schema=False)
async def extract_upload(
    file: UploadFile = File(...),
    caption: Optional[str] = Form(default=None),
    source_url: Optional[str] = Form(default=None),
) -> ExtractResponse:
    try:
        extractor = get_extractor()
    except GeminiError as err:
        raise HTTPException(status_code=500, detail=str(err))

    workdir = Path(tempfile.mkdtemp(prefix="upload_"))
    try:
        name = Path(file.filename or "video.mp4").name
        path = workdir / name
        size = 0
        with path.open("wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > sources.MAX_FILESIZE:
                    raise HTTPException(status_code=413, detail="Video is too large (max 200 MB).")
                out.write(chunk)
        mime = file.content_type if (file.content_type or "").startswith("video/") else sources.guess_video_mime(name)
        url = sources.extract_url(source_url or "")
        src = sources.VideoSource(
            url=url or "",
            platform=sources.detect_platform(url) if url else "upload",
            description=caption,
        )
        result = await _run(extractor.from_file, path, mime, src.caption_context())
        return _respond(src, result, url)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


# ---- Web app ---------------------------------------------------------------
# Docker/local: serve the whole exported web build from WEB_DIST.
# Vercel: static files come from public/ via the CDN; only page routes (/, /recipe/…)
# reach this function, and get the SPA shell copied to app/web_index.html by
# scripts/build-web.sh.
from fastapi.responses import FileResponse, HTMLResponse  # noqa: E402

WEB_DIST = Path(os.environ.get("WEB_DIST", Path(__file__).resolve().parent.parent / "web"))
WEB_INDEX = Path(__file__).resolve().parent / "web_index.html"


@app.get("/{path:path}", include_in_schema=False)
def web_app(path: str):
    if path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    root = WEB_DIST.resolve()
    if (root / "index.html").exists():
        candidate = (root / path).resolve()
        if path and candidate.is_file() and root in candidate.parents:
            headers = {"Cache-Control": "public, max-age=31536000, immutable"} if path.startswith("_expo/") else None
            return FileResponse(candidate, headers=headers)
        return FileResponse(root / "index.html", headers={"Cache-Control": "no-cache"})
    if WEB_INDEX.exists():
        return HTMLResponse(WEB_INDEX.read_text(), headers={"Cache-Control": "no-cache"})
    raise HTTPException(status_code=404, detail="Not found")
