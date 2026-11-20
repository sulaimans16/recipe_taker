"""Ask Gemini to watch a cooking video and return structured recipes."""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Optional

from .schema import ExtractionResult

log = logging.getLogger("recipe_taker.gemini")

DEFAULT_MODEL = "gemini-3.8-flash"
# Used when the main model is overloaded (503) or rate-limited (429) after retries.
DEFAULT_FALLBACK_MODEL = "gemini-3.5-flash"
RETRYABLE_CODES = {429, 500, 503, 504}

SYSTEM_PROMPT = """You are a meticulous chef's assistant. You watch short cooking videos \
(Instagram Reels, YouTube Shorts, TikToks) and write down every recipe in them so someone \
can cook the dish without rewatching.

How to work:
- Use ALL signals: what is spoken (in any language or dialect, including mixed languages like \
Hinglish), on-screen text, what you see being added to the pan/bowl, and the post caption if given.
- Extract EVERY distinct recipe. A sauce, marinade, dough, chutney or side made from scratch is its \
own recipe; a store-bought item is just an ingredient.
- Ingredients: list each one once per recipe in the order used. Quantities ONLY if spoken, shown, or \
written in the caption; otherwise leave quantity null (add notes like "to taste" when said). Never \
invent precise amounts. If you can confidently estimate from the visuals, put "approx." in notes.
- Steps: complete, ordered, actionable. Include heat level, timings, and visual doneness cues \
("until golden", "until oil separates"). Add timestamp_sec when you can tell where the step starts.
- Write the main recipe fields in the video's ORIGINAL language and script (e.g. Hindi in \
Devanagari if spoken Hindi, Arabic in Arabic script). If the speaker mixes languages, use the \
dominant one as they would write it. Do NOT add English glosses in brackets to the original fields (no "சிக்கன் (Chicken)"); the English version goes only in `english`.
- Set video_duration_sec to the video's length, and never give a timestamp beyond it.
- Then fill `english` with a faithful, natural English translation of the same recipe (keep dish \
names recognisable, e.g. "Paneer Butter Masala"). If the original is English, set `english` to null.
- If there's no recipe (e.g. a restaurant review or mukbang), return an empty recipes list and \
explain in no_recipe_reason.
"""


class GeminiError(Exception):
    pass


class RecipeExtractor:
    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        from google import genai

        key = api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not key:
            raise GeminiError("GEMINI_API_KEY is not set on the server.")
        self.client = genai.Client(api_key=key)
        self.model = model or os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL
        fallback = os.environ.get("GEMINI_FALLBACK_MODEL", DEFAULT_FALLBACK_MODEL)
        self.models = [self.model] + ([fallback] if fallback and fallback != self.model else [])
        self.thinking_level = os.environ.get("GEMINI_THINKING_LEVEL", "LOW")
        self.retry_delays = (3, 8)

    # ---- public API -------------------------------------------------------

    def from_youtube_url(self, url: str, context: str = "") -> ExtractionResult:
        """Gemini can read public YouTube videos directly from the URL."""
        from google.genai import types

        part = types.Part(file_data=types.FileData(file_uri=url))
        return self._generate(part, context)

    def from_file(self, path: Path, mime_type: str, context: str = "") -> ExtractionResult:
        from google.genai import types

        uploaded = self.client.files.upload(file=str(path), config={"mime_type": mime_type})
        try:
            uploaded = self._wait_active(uploaded)
            part = types.Part.from_uri(file_uri=uploaded.uri, mime_type=uploaded.mime_type or mime_type)
            return self._generate(part, context)
        finally:
            try:
                self.client.files.delete(name=uploaded.name)
            except Exception:
                pass

    # ---- internals --------------------------------------------------------

    def _wait_active(self, file, timeout: float = 180):
        deadline = time.monotonic() + timeout
        while True:
            state = getattr(file.state, "name", str(file.state))
            if state == "ACTIVE":
                return file
            if state == "FAILED":
                raise GeminiError("Gemini couldn't process this video file.")
            if time.monotonic() > deadline:
                raise GeminiError("Timed out waiting for Gemini to process the video.")
            time.sleep(2)
            file = self.client.files.get(name=file.name)

    def _generate(self, video_part, context: str) -> ExtractionResult:
        from google.genai import types

        prompt = "Extract all recipes from this video."
        if context.strip():
            prompt += (
                "\n\nPost details (may contain the exact quantities — prefer them over guesses, "
                "but ignore hashtags and promos):\n" + context.strip()
            )
        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_json_schema=ExtractionResult.model_json_schema(),
            temperature=0.2,
            media_resolution="MEDIA_RESOLUTION_LOW",
            thinking_config=types.ThinkingConfig(thinking_level=self.thinking_level) if self.thinking_level else None,
        )
        resp = self._call_with_retry([video_part, prompt], config)
        return parse_result(resp.text)

    def _call_with_retry(self, contents, config):
        """Retry overloaded/rate-limited calls, then try the fallback model."""
        last: Exception | None = None
        for model in self.models:
            for attempt in range(len(self.retry_delays) + 1):
                try:
                    return self.client.models.generate_content(model=model, contents=contents, config=config)
                except Exception as err:
                    last = err
                    code = getattr(err, "code", None)
                    if code not in RETRYABLE_CODES:
                        raise GeminiError(f"Gemini request failed: {err}") from err
                    if attempt < len(self.retry_delays):
                        log.warning("Gemini %s on %s, retrying", code, model)
                        time.sleep(self.retry_delays[attempt])
            log.warning("Giving up on %s, trying next model", model)
        raise GeminiError("Gemini is busy right now. Please try again in a minute.") from last


def parse_result(text: Optional[str]) -> ExtractionResult:
    if not text:
        raise GeminiError("Gemini returned an empty response.")
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        cleaned = cleaned[cleaned.find("{"):]
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as err:
        raise GeminiError("Gemini returned malformed JSON.") from err
    result = ExtractionResult.model_validate(data)
    limit = result.video_duration_sec
    for recipe in result.recipes:
        for steps in (recipe.steps, recipe.english.steps if recipe.english else []):
            for step in steps:
                if step.timestamp_sec is not None and (step.timestamp_sec < 0 or (limit and step.timestamp_sec > limit)):
                    step.timestamp_sec = None
    for recipe in result.recipes:
        if recipe.english is not None and result.detected_language.lower().startswith("en"):
            recipe.english = None
    return result
