// Mirrors backend/app/schema.py

export type Ingredient = {
  name: string;
  quantity?: string | null;
  unit?: string | null;
  notes?: string | null;
};

export type Step = { text: string; timestamp_sec?: number | null };

export type RecipeContent = {
  title: string;
  description?: string | null;
  servings?: string | null;
  prep_time?: string | null;
  cook_time?: string | null;
  ingredients: Ingredient[];
  steps: Step[];
  tips: string[];
};

export type Recipe = RecipeContent & { english?: RecipeContent | null };

export type Platform = "youtube" | "instagram" | "tiktok" | "facebook" | "upload" | "other";

export type ExtractResponse = {
  detected_language: string;
  recipes: Recipe[];
  no_recipe_reason?: string | null;
  source_url?: string | null;
  platform: Platform;
  source_title?: string | null;
  author?: string | null;
  thumbnail_url?: string | null;
};

export type SavedVideo = {
  id: string;
  createdAt: number;
  data: ExtractResponse;
};
