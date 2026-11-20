// Web storage (for previewing in a browser): localStorage.
import type { ExtractResponse, SavedVideo } from "./types";

const KEY = "recipe-taker:videos";

function read(): SavedVideo[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
function write(v: SavedVideo[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {}
}

export async function listVideos() {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}
export async function getVideo(id: string) {
  return read().find((v) => v.id === id) ?? null;
}
export async function findBySourceUrl(url: string) {
  return read().find((v) => v.data.source_url === url) ?? null;
}
export async function saveVideo(data: ExtractResponse) {
  const all = read();
  const existing = data.source_url ? all.find((v) => v.data.source_url === data.source_url) : undefined;
  if (existing) {
    existing.data = data;
    existing.createdAt = Date.now();
    write(all);
    return existing.id;
  }
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  write([...all, { id, createdAt: Date.now(), data }]);
  return id;
}
export async function deleteVideo(id: string) {
  write(read().filter((v) => v.id !== id));
}
export async function getSetting(key: string) {
  try {
    return localStorage.getItem(`recipe-taker:setting:${key}`);
  } catch {
    return null;
  }
}
export async function setSetting(key: string, value: string) {
  try {
    localStorage.setItem(`recipe-taker:setting:${key}`, value);
  } catch {}
}
