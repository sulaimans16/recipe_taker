import pytest

from app import gemini


class FakeErr(Exception):
    def __init__(self, code):
        super().__init__(f"{code} error")
        self.code = code


class FakeModels:
    def __init__(self, script):
        self.script = list(script)
        self.calls = []

    def generate_content(self, model, contents, config):
        self.calls.append(model)
        outcome = self.script.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def make(script, monkeypatch):
    monkeypatch.setattr(gemini.time, "sleep", lambda s: None)
    ex = gemini.RecipeExtractor.__new__(gemini.RecipeExtractor)
    ex.client = type("C", (), {})()
    ex.client.models = FakeModels(script)
    ex.models = ["main", "fallback"]
    ex.retry_delays = (0, 0)
    return ex


def test_retries_then_succeeds(monkeypatch):
    ex = make([FakeErr(503), "ok"], monkeypatch)
    assert ex._call_with_retry([], None) == "ok"
    assert ex.client.models.calls == ["main", "main"]


def test_falls_back_to_second_model(monkeypatch):
    ex = make([FakeErr(503)] * 3 + ["ok"], monkeypatch)
    assert ex._call_with_retry([], None) == "ok"
    assert ex.client.models.calls == ["main"] * 3 + ["fallback"]


def test_gives_up_with_friendly_message(monkeypatch):
    ex = make([FakeErr(429)] * 6, monkeypatch)
    with pytest.raises(gemini.GeminiError, match="busy"):
        ex._call_with_retry([], None)


def test_non_retryable_fails_fast(monkeypatch):
    ex = make([FakeErr(400)], monkeypatch)
    with pytest.raises(gemini.GeminiError, match="request failed"):
        ex._call_with_retry([], None)
    assert ex.client.models.calls == ["main"]
