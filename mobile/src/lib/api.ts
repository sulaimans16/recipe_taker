import { Platform } from "react-native";
import { getSetting } from "./storage";
import type { ExtractResponse } from "./types";

// On the web build served by the backend itself, the API is on the same origin.
export const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : "http://localhost:8000");
export const DEFAULT_APP_TOKEN = process.env.EXPO_PUBLIC_APP_TOKEN ?? "";

async function config() {
  const url = ((await getSetting("apiUrl")) || DEFAULT_API_URL).replace(/\/+$/, "");
  const token = (await getSetting("appToken")) ?? DEFAULT_APP_TOKEN;
  const headers: Record<string, string> = {};
  if (token) headers["X-App-Token"] = token;
  return { url, headers };
}

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function handle(res: Response): Promise<ExtractResponse> {
  if (res.ok) return res.json();
  let detail = `Server error (${res.status})`;
  try {
    const body = await res.json();
    if (typeof body.detail === "string") detail = body.detail;
  } catch {}
  if (res.status === 401) detail = "This server needs an access code.";
  throw new ApiError(detail, res.status);
}

async function call(path: string, init: RequestInit): Promise<ExtractResponse> {
  const { url, headers } = await config();
  let res: Response;
  try {
    res = await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...(init.headers as object) } });
  } catch {
    throw new ApiError(`Can't reach the server at ${url}. Check the server address in Settings.`);
  }
  return handle(res);
}

/** Extract recipes from a link or from raw shared text containing a link. */
export function extractFromLink(textOrUrl: string, refresh = false) {
  return call(`/api/extract${refresh ? "?refresh=true" : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: textOrUrl }),
  });
}

export type LocalVideo = { uri: string; name: string; mimeType: string; file?: Blob };

/** Upload a video file from the device (gallery pick or share sheet). */
export function extractFromFile(video: LocalVideo, opts: { caption?: string; sourceUrl?: string } = {}) {
  const form = new FormData();
  if (Platform.OS === "web" && video.file) {
    form.append("file", video.file, video.name);
  } else {
    // React Native's FormData accepts { uri, name, type } objects.
    form.append("file", { uri: video.uri, name: video.name, type: video.mimeType } as unknown as Blob);
  }
  if (opts.caption) form.append("caption", opts.caption);
  if (opts.sourceUrl) form.append("source_url", opts.sourceUrl);
  return call("/api/extract/upload", { method: "POST", body: form });
}

/** Find the first http(s) link in arbitrary text. */
export function findUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[.,;:!?)\]}]+$/, "") : null;
}
