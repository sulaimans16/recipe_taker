"""Data models shared by the Gemini structured output and the HTTP API."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class Ingredient(BaseModel):
    name: str = Field(description="Ingredient name, exactly as said/shown in the video's language.")
    quantity: Optional[str] = Field(
        default=None,
        description="Amount as a string (e.g. '2', '1/2', '200'). Null if not stated; never invent one.",
    )
    unit: Optional[str] = Field(default=None, description="Unit (g, cup, tbsp, pinch...). Null if none.")
    notes: Optional[str] = Field(
        default=None, description="Extra detail: 'finely chopped', 'to taste', 'optional', 'room temperature'."
    )


class Step(BaseModel):
    text: str = Field(description="One clear instruction, including heat level, time and visual cues.")
    timestamp_sec: Optional[float] = Field(
        default=None, description="Second in the video where this step starts, if known."
    )


class RecipeContent(BaseModel):
    title: str
    description: Optional[str] = Field(default=None, description="One or two sentences about the dish.")
    servings: Optional[str] = None
    prep_time: Optional[str] = None
    cook_time: Optional[str] = None
    ingredients: list[Ingredient] = Field(default_factory=list)
    steps: list[Step] = Field(default_factory=list)
    tips: list[str] = Field(default_factory=list, description="Tips, substitutions or serving suggestions.")


class Recipe(RecipeContent):
    english: Optional[RecipeContent] = Field(
        default=None,
        description="The same recipe fully translated to English. Null when the original is already English.",
    )


class ExtractionResult(BaseModel):
    """What the model returns for one video."""

    detected_language: str = Field(
        description="Main spoken/written language of the video as a BCP-47 code, e.g. 'en', 'hi', 'ar', 'es'."
    )
    video_duration_sec: Optional[float] = Field(default=None, description="Length of the video in seconds.")
    recipes: list[Recipe] = Field(
        default_factory=list,
        description="Every distinct recipe in the video (sauces, doughs and sides that are made from scratch count).",
    )
    no_recipe_reason: Optional[str] = Field(
        default=None, description="If no recipe is present, explain why in one English sentence."
    )


Platform = Literal["youtube", "instagram", "tiktok", "facebook", "upload", "other"]


class ExtractResponse(ExtractionResult):
    """API response: the extraction plus where it came from."""

    source_url: Optional[str] = None
    platform: Platform
    source_title: Optional[str] = None
    author: Optional[str] = None
    thumbnail_url: Optional[str] = None


class ExtractRequest(BaseModel):
    url: Optional[str] = Field(default=None, description="Video link.")
    text: Optional[str] = Field(
        default=None, description="Raw shared text (e.g. from the share sheet); the first link in it is used."
    )
