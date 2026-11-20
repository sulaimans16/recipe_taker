import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import main, sources
from app.gemini import GeminiError, parse_result

SAMPLE = {
    "detected_language": "hi",
    "recipes": [
        {
            "title": "आलू पराठा",
            "ingredients": [{"name": "आलू", "quantity": "3", "unit": None, "notes": "उबले हुए"}],
            "steps": [{"text": "आलू मैश करें", "timestamp_sec": 4}],
            "tips": [],
            "english": {
                "title": "Aloo Paratha",
                "ingredients": [{"name": "Potato", "quantity": "3", "notes": "boiled"}],
                "steps": [{"text": "Mash the potatoes"}],
            },
        }
    ],
}


class FakeExtractor:
    def __init__(self):
        self.calls = []
        self.fail_youtube = False

    def from_youtube_url(self, url, context=""):
        self.calls.append(("youtube", url, context))
        if self.fail_youtube:
            raise GeminiError("nope")
        return parse_result(json.dumps(SAMPLE))

    def from_file(self, path, mime, context=""):
        assert Path(path).exists()
        self.calls.append(("file", mime, context))
        return parse_result(json.dumps(SAMPLE))


@pytest.fixture
def fake(monkeypatch):
    fake = FakeExtractor()
    monkeypatch.setattr(main, "_extractor", fake)
    main._cache.clear()
    monkeypatch.setattr(
        sources,
        "fetch_metadata",
        lambda url: sources.VideoSource(url=url, platform="youtube", title="Paratha", description="caption"),
    )

    def fake_download(url, workdir):
        p = workdir / "video.mp4"
        p.write_bytes(b"\x00" * 10)
        return sources.VideoSource(url=url, platform="instagram", title="Reel", file_path=p, description="2 cups flour")

    monkeypatch.setattr(sources, "download_video", fake_download)
    monkeypatch.delenv("APP_TOKEN", raising=False)
    return fake


client = TestClient(main.app)


def test_youtube_direct(fake):
    r = client.post("/api/extract", json={"text": "look https://youtube.com/shorts/abcDEF12345?si=x"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["platform"] == "youtube"
    assert body["source_url"] == "https://www.youtube.com/watch?v=abcDEF12345"
    assert body["recipes"][0]["english"]["title"] == "Aloo Paratha"
    assert fake.calls[0][0] == "youtube" and "caption" in fake.calls[0][2]


def test_youtube_falls_back_to_download(fake):
    fake.fail_youtube = True
    r = client.post("/api/extract", json={"url": "https://youtu.be/abcDEF12345"})
    assert r.status_code == 200
    assert [c[0] for c in fake.calls] == ["youtube", "file"]


def test_instagram_download_and_cache(fake):
    r1 = client.post("/api/extract", json={"url": "https://www.instagram.com/reel/XYZ/?igsh=1"})
    r2 = client.post("/api/extract", json={"url": "https://instagram.com/reel/XYZ"})
    assert r1.status_code == r2.status_code == 200
    assert len(fake.calls) == 1  # second served from cache
    assert "2 cups flour" in fake.calls[0][2]


def test_no_link(fake):
    r = client.post("/api/extract", json={"text": "hello"})
    assert r.status_code == 400


def test_source_error_is_422(fake, monkeypatch):
    def boom(url, workdir):
        raise sources.SourceError("Instagram blocked the download")

    monkeypatch.setattr(sources, "download_video", boom)
    r = client.post("/api/extract", json={"url": "https://www.instagram.com/reel/ABC/"})
    assert r.status_code == 422
    assert "Instagram" in r.json()["detail"]


def test_upload(fake):
    r = client.post(
        "/api/extract/upload",
        files={"file": ("clip.mov", b"\x00" * 100, "application/octet-stream")},
        data={"caption": "salt to taste"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["platform"] == "upload"
    assert fake.calls[0][1] == "video/quicktime"


def test_token(fake, monkeypatch):
    monkeypatch.setenv("APP_TOKEN", "s3cret")
    url = {"url": "https://youtu.be/abcDEF12345"}
    assert client.post("/api/extract", json=url).status_code == 401
    assert client.post("/api/extract", json=url, headers={"X-App-Token": "s3cret"}).status_code == 200


def test_parse_result_strips_english_for_english_videos():
    data = dict(SAMPLE, detected_language="en")
    res = parse_result("```json\n" + json.dumps(data) + "\n```")
    assert res.recipes[0].english is None


def test_schema_is_json_serializable():
    from app.schema import ExtractionResult

    json.dumps(ExtractionResult.model_json_schema())


def test_serves_web_app(tmp_path, monkeypatch):
    import importlib

    (tmp_path / "index.html").write_text("<html>app</html>")
    (tmp_path / "manifest.webmanifest").write_text("{}")
    monkeypatch.setenv("WEB_DIST", str(tmp_path))
    mod = importlib.reload(main)
    try:
        c = TestClient(mod.app)
        assert c.get("/").text == "<html>app</html>"
        assert c.get("/recipe/abc").text == "<html>app</html>"  # SPA fallback
        assert c.get("/extract?url=x").text == "<html>app</html>"  # GET page, not the POST API
        assert c.get("/manifest.webmanifest").text == "{}"
        assert c.get("/../../etc/passwd").text == "<html>app</html>"
        assert c.get("/health").json() == {"ok": True}
        assert c.post("/extract", json={"text": "no link"}).status_code == 400
    finally:
        monkeypatch.delenv("WEB_DIST")
        importlib.reload(main)


def test_legacy_paths_still_work(fake):
    assert client.get("/health").json() == {"ok": True}
    assert client.get("/api/health").json() == {"ok": True}
    assert client.post("/extract", json={"url": "https://youtu.be/abcDEF12345"}).status_code == 200


def test_timestamps_past_video_end_are_dropped():
    data = json.loads(json.dumps(SAMPLE))
    data["video_duration_sec"] = 30
    data["recipes"][0]["steps"] = [{"text": "a", "timestamp_sec": 10}, {"text": "b", "timestamp_sec": 101}]
    res = parse_result(json.dumps(data))
    assert [s.timestamp_sec for s in res.recipes[0].steps] == [10, None]


def test_spa_shell_fallback(monkeypatch, tmp_path):
    shell = tmp_path / "web_index.html"
    shell.write_text("<html>shell</html>")
    monkeypatch.setattr(main, "WEB_DIST", tmp_path / "missing")
    monkeypatch.setattr(main, "WEB_INDEX", shell)
    assert client.get("/").text == "<html>shell</html>"
    assert client.get("/recipe/abc").text == "<html>shell</html>"
    assert client.get("/api/nope").status_code == 404
    assert client.get("/api/health").json()["ok"] is True
