import pytest

from app import sources


@pytest.mark.parametrize(
    "text,expected",
    [
        ("Check this out! https://www.instagram.com/reel/C8abc123/?igsh=xyz", "https://www.instagram.com/reel/C8abc123/?igsh=xyz"),
        ("https://youtube.com/shorts/dQw4w9WgXcQ?si=abc.", "https://youtube.com/shorts/dQw4w9WgXcQ?si=abc"),
        ("no link here", None),
        ("", None),
    ],
)
def test_extract_url(text, expected):
    assert sources.extract_url(text) == expected


@pytest.mark.parametrize(
    "url,platform,normalized",
    [
        ("https://youtube.com/shorts/dQw4w9WgXcQ?si=abc", "youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
        ("https://youtu.be/dQw4w9WgXcQ?t=3", "youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
        ("https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share", "youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
        ("https://www.instagram.com/reel/C8abc123/?igsh=xyz", "instagram", "https://www.instagram.com/reel/C8abc123/"),
        ("https://instagram.com/reels/C8abc123", "instagram", "https://www.instagram.com/reel/C8abc123/"),
        ("https://www.instagram.com/someone/p/C8abc123/?img_index=1", "instagram", "https://www.instagram.com/p/C8abc123/"),
        ("https://www.tiktok.com/@chef/video/123?lang=en", "tiktok", "https://www.tiktok.com/@chef/video/123"),
        ("https://example.com/v.mp4", "other", "https://example.com/v.mp4"),
    ],
)
def test_platform_and_normalize(url, platform, normalized):
    assert sources.detect_platform(url) == platform
    assert sources.normalize_url(url) == normalized


def test_caption_context():
    src = sources.VideoSource(url="u", platform="instagram", title="Dal", author="chef", description="1 cup dal")
    ctx = src.caption_context()
    assert "Dal" in ctx and "chef" in ctx and "1 cup dal" in ctx
