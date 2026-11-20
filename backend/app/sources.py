"""Finding links in shared text and fetching videos/metadata with yt-dlp."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
from urllib.parse import parse_qs, urlparse

MAX_DURATION_SEC = int(os.environ.get("MAX_VIDEO_SECONDS", 600))
MAX_FILESIZE = int(os.environ.get("MAX_VIDEO_BYTES", 200 * 1024 * 1024))

_URL_RE = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)


class SourceError(Exception):
    """A problem with the link or the download that the user can act on."""


@dataclass
class VideoSource:
    url: str
    platform: str
    title: Optional[str] = None
    description: Optional[str] = None
    author: Optional[str] = None
    thumbnail_url: Optional[str] = None
    duration: Optional[float] = None
    file_path: Optional[Path] = None
    mime_type: str = "video/mp4"
    extra: dict = field(default_factory=dict)

    def caption_context(self) -> str:
        parts = []
        if self.title:
            parts.append(f"Title: {self.title}")
        if self.author:
            parts.append(f"Creator: {self.author}")
        if self.description:
            parts.append(f"Caption/description:\n{self.description[:5000]}")
        return "\n".join(parts)


def extract_url(text: str) -> Optional[str]:
    """Return the first http(s) link inside arbitrary shared text."""
    if not text:
        return None
    match = _URL_RE.search(text)
    if not match:
        return None
    return match.group(0).rstrip(".,;:!?)]}")


def detect_platform(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    if host in {"youtube.com", "m.youtube.com", "youtu.be", "music.youtube.com"} or host.endswith(".youtube.com"):
        return "youtube"
    if host in {"instagram.com", "instagr.am"} or host.endswith(".instagram.com"):
        return "instagram"
    if host.endswith("tiktok.com"):
        return "tiktok"
    if host in {"facebook.com", "fb.watch", "m.facebook.com"} or host.endswith(".facebook.com"):
        return "facebook"
    return "other"


def youtube_id(url: str) -> Optional[str]:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if host.endswith("youtu.be"):
        vid = parsed.path.strip("/").split("/")[0]
        return vid or None
    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) >= 2 and parts[0] in {"shorts", "embed", "live", "v"}:
        return parts[1]
    qs = parse_qs(parsed.query)
    if "v" in qs:
        return qs["v"][0]
    return None


def normalize_url(url: str) -> str:
    """Canonical form, used as a cache key and for Gemini's YouTube input."""
    platform = detect_platform(url)
    if platform == "youtube":
        vid = youtube_id(url)
        if vid:
            return f"https://www.youtube.com/watch?v={vid}"
    if platform == "instagram":
        parsed = urlparse(url)
        parts = [p for p in parsed.path.split("/") if p]
        for i, part in enumerate(parts):
            if part in {"reel", "reels", "p", "tv"} and i + 1 < len(parts):
                kind = "reel" if part == "reels" else part
                return f"https://www.instagram.com/{kind}/{parts[i + 1]}/"
    # Drop tracking query strings for everything else.
    parsed = urlparse(url)
    return parsed._replace(query="", fragment="").geturl()


def _ydl_opts(**extra) -> dict:
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "socket_timeout": 30,
    }
    cookies = os.environ.get("YTDLP_COOKIES_FILE")
    if cookies and Path(cookies).exists():
        opts["cookiefile"] = cookies
    opts.update(extra)
    return opts


def _friendly_error(platform: str, err: Exception) -> SourceError:
    msg = str(err)
    low = msg.lower()
    if platform == "instagram" and any(k in low for k in ("login", "rate-limit", "cookies", "private", "not available")):
        return SourceError(
            "Instagram blocked the download (it sometimes requires a login). "
            "Try again later, or save the reel to your phone and share the video file instead."
        )
    if "private" in low:
        return SourceError("This video is private, so it can't be read.")
    if "unsupported url" in low:
        return SourceError("That link isn't a supported video link.")
    return SourceError(f"Couldn't fetch the video: {msg.splitlines()[0][:300]}")


def _apply_info(src: VideoSource, info: dict) -> None:
    src.title = info.get("title") or src.title
    src.description = info.get("description") or src.description
    src.author = info.get("uploader") or info.get("channel") or info.get("uploader_id") or src.author
    src.thumbnail_url = info.get("thumbnail") or src.thumbnail_url
    src.duration = info.get("duration") or src.duration


def _check_duration(src: VideoSource) -> None:
    if src.duration and src.duration > MAX_DURATION_SEC:
        raise SourceError(
            f"This video is {int(src.duration // 60)} min long; the limit is {MAX_DURATION_SEC // 60} min."
        )


def fetch_metadata(url: str) -> VideoSource:
    """Title/caption/thumbnail without downloading the video."""
    import yt_dlp

    platform = detect_platform(url)
    src = VideoSource(url=url, platform=platform)
    try:
        with yt_dlp.YoutubeDL(_ydl_opts(skip_download=True)) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as err:  # yt-dlp raises many types
        raise _friendly_error(platform, err) from err
    _apply_info(src, info or {})
    _check_duration(src)
    return src


def download_video(url: str, workdir: Path) -> VideoSource:
    """Download the video (<= 720p, mp4) into workdir and return it with metadata."""
    import yt_dlp

    platform = detect_platform(url)
    src = VideoSource(url=url, platform=platform)
    opts = _ydl_opts(
        outtmpl=str(workdir / "video.%(ext)s"),
        format="b[ext=mp4][height<=720]/bv*[height<=720]+ba/b[height<=720]/b",
        merge_output_format="mp4",
        max_filesize=MAX_FILESIZE,
        match_filter=yt_dlp.utils.match_filter_func(f"!duration | duration <= {MAX_DURATION_SEC}"),
    )
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
    except Exception as err:
        raise _friendly_error(platform, err) from err
    info = info or {}
    if info.get("_type") == "playlist" and info.get("entries"):
        # Instagram carousels: take the first video entry.
        info = next((e for e in info["entries"] if e), info)
    _apply_info(src, info)
    _check_duration(src)

    files = sorted(p for p in workdir.glob("video.*") if p.suffix not in {".part", ".ytdl"})
    if not files:
        raise SourceError("The video couldn't be downloaded (it may be too large or a photo post).")
    src.file_path = files[0]
    src.mime_type = guess_video_mime(src.file_path.name)
    return src


def guess_video_mime(filename: str, fallback: str = "video/mp4") -> str:
    ext = Path(filename).suffix.lower()
    return {
        ".mp4": "video/mp4",
        ".m4v": "video/mp4",
        ".mov": "video/quicktime",
        ".webm": "video/webm",
        ".mkv": "video/x-matroska",
        ".3gp": "video/3gpp",
        ".avi": "video/x-msvideo",
    }.get(ext, fallback)
