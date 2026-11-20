// Native storage: on-device SQLite.
import * as SQLite from "expo-sqlite";
import type { ExtractResponse, SavedVideo } from "./types";

let db: SQLite.SQLiteDatabase | null = null;

async function getDb() {
  if (!db) {
    db = await SQLite.openDatabaseAsync("recipes.db");
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY NOT NULL,
        source_url TEXT,
        created_at INTEGER NOT NULL,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT);
    `);
  }
  return db;
}

type Row = { id: string; created_at: number; json: string };
const toSaved = (r: Row): SavedVideo => ({ id: r.id, createdAt: r.created_at, data: JSON.parse(r.json) });

export async function listVideos(): Promise<SavedVideo[]> {
  const rows = await (await getDb()).getAllAsync<Row>(
    "SELECT id, created_at, json FROM videos ORDER BY created_at DESC"
  );
  return rows.map(toSaved);
}

export async function getVideo(id: string): Promise<SavedVideo | null> {
  const row = await (await getDb()).getFirstAsync<Row>("SELECT id, created_at, json FROM videos WHERE id = ?", id);
  return row ? toSaved(row) : null;
}

export async function findBySourceUrl(url: string): Promise<SavedVideo | null> {
  const row = await (await getDb()).getFirstAsync<Row>(
    "SELECT id, created_at, json FROM videos WHERE source_url = ?",
    url
  );
  return row ? toSaved(row) : null;
}

export async function saveVideo(data: ExtractResponse): Promise<string> {
  const d = await getDb();
  if (data.source_url) {
    const existing = await findBySourceUrl(data.source_url);
    if (existing) {
      await d.runAsync("UPDATE videos SET json = ?, created_at = ? WHERE id = ?", JSON.stringify(data), Date.now(), existing.id);
      return existing.id;
    }
  }
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await d.runAsync(
    "INSERT INTO videos (id, source_url, created_at, json) VALUES (?, ?, ?, ?)",
    id,
    data.source_url ?? null,
    Date.now(),
    JSON.stringify(data)
  );
  return id;
}

export async function deleteVideo(id: string): Promise<void> {
  await (await getDb()).runAsync("DELETE FROM videos WHERE id = ?", id);
}

export async function getSetting(key: string): Promise<string | null> {
  const row = await (await getDb()).getFirstAsync<{ value: string | null }>("SELECT value FROM settings WHERE key = ?", key);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await (await getDb()).runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", key, value);
}
