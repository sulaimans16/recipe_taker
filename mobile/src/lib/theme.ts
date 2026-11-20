import { useColorScheme } from "react-native";

const light = {
  bg: "#FBF7F2",
  card: "#FFFFFF",
  text: "#231A14",
  muted: "#7A6B60",
  border: "#EADFD3",
  accent: "#D9480F",
  accentText: "#FFFFFF",
  accentSoft: "#FFE8DC",
  danger: "#C92A2A",
  check: "#2F9E44",
};

const dark: typeof light = {
  bg: "#16110E",
  card: "#221A15",
  text: "#F5EDE6",
  muted: "#AE9E92",
  border: "#3A2E26",
  accent: "#FF7A3D",
  accentText: "#1A0F09",
  accentSoft: "#3B2418",
  danger: "#FF6B6B",
  check: "#69DB7C",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}

export const PLATFORM_LABEL: Record<string, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  upload: "Uploaded video",
  other: "Video",
};

export function languageName(code: string): string {
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "language" });
    return dn.of(code) ?? code;
  } catch {
    return code;
  }
}
