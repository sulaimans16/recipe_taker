import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { Link, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { findUrl } from "../lib/api";
import { pendingUpload } from "../lib/pending";
import { listVideos } from "../lib/storage";
import { PLATFORM_LABEL, useTheme } from "../lib/theme";
import type { SavedVideo } from "../lib/types";

export default function Home() {
  const t = useTheme();
  const s = styles(t);
  const router = useRouter();
  const [link, setLink] = useState("");
  const [query, setQuery] = useState("");
  const [videos, setVideos] = useState<SavedVideo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      listVideos().then(setVideos);
    }, [])
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return videos;
    return videos.filter((v) =>
      v.data.recipes.some(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.english?.title.toLowerCase().includes(q) ||
          r.ingredients.some((i) => i.name.toLowerCase().includes(q)) ||
          r.english?.ingredients.some((i) => i.name.toLowerCase().includes(q))
      )
    );
  }, [videos, query]);

  const submit = (text = link) => {
    const url = findUrl(text);
    if (!url) {
      setError("That doesn't look like a link. Copy the reel or short's link and paste it here.");
      return;
    }
    setError(null);
    setLink("");
    router.push({ pathname: "/extract", params: { url } });
  };

  const paste = async () => {
    let text = "";
    try {
      text = await Clipboard.getStringAsync();
    } catch {
      // Browsers may block clipboard access.
    }
    if (findUrl(text)) submit(text);
    else setError("Couldn't find a link on your clipboard. Paste it into the box above.");
  };

  const pickVideo = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: "video/*", copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    pendingUpload.set({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? "video/mp4", file: a.file });
    router.push({ pathname: "/extract", params: { upload: "1" } });
  };

  const header = (
    <View style={s.header}>
      <Text style={s.lede}>
        Share a Reel or Short to Recipe Taker, or paste its link. You'll get the full recipe in its own
        language and in English.
      </Text>
      <View style={s.inputRow}>
        <TextInput
          value={link}
          onChangeText={setLink}
          placeholder="Paste an Instagram or YouTube link"
          placeholderTextColor={t.muted}
          style={s.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={() => submit()}
        />
      </View>
      <View style={s.buttonRow}>
        <Pressable style={[s.btn, s.btnPrimary]} onPress={() => (link.trim() ? submit() : paste())}>
          <Text style={s.btnPrimaryText}>{link.trim() ? "Get recipe" : "Paste link & go"}</Text>
        </Pressable>
        <Pressable style={[s.btn, s.btnSecondary]} onPress={pickVideo}>
          <Text style={s.btnSecondaryText}>Upload video</Text>
        </Pressable>
      </View>
      {error && <Text style={s.error}>{error}</Text>}

      <View style={s.sectionRow}>
        <Text style={s.section}>Your recipes</Text>
        <Link href="/settings" style={s.settingsLink}>
          Settings
        </Link>
      </View>
      {videos.length > 0 && (
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by dish or ingredient"
          placeholderTextColor={t.muted}
          style={[s.input, s.search]}
        />
      )}
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={s.list}
      contentInsetAdjustmentBehavior="automatic"
      data={filtered}
      keyExtractor={(v) => v.id}
      ListHeaderComponent={header}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={
        <Text style={s.empty}>
          {videos.length
            ? "No recipes match that search."
            : Platform.OS === "web"
              ? "No recipes yet. Paste a Reel or Short link above to get started."
              : "No recipes yet. On Instagram or YouTube, tap Share and pick Recipe Taker."}
        </Text>
      }
      renderItem={({ item }) => <VideoCard v={item} />}
    />
  );
}

function VideoCard({ v }: { v: SavedVideo }) {
  const t = useTheme();
  const s = styles(t);
  const first = v.data.recipes[0];
  const title = first ? first.english?.title || first.title : v.data.source_title || "No recipe found";
  const original = first?.english ? first.title : null;
  const more = v.data.recipes.length - 1;
  return (
    <Link href={{ pathname: "/recipe/[id]", params: { id: v.id } }} asChild>
      <Pressable style={s.card}>
        {v.data.thumbnail_url ? (
          <Image source={{ uri: v.data.thumbnail_url }} style={s.thumb} />
        ) : (
          <View style={[s.thumb, s.thumbPlaceholder]}>
            <Text style={{ fontSize: 26 }}>🍳</Text>
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.cardTitle} numberOfLines={2}>
            {title}
          </Text>
          {original && (
            <Text style={s.cardSub} numberOfLines={1}>
              {original}
            </Text>
          )}
          <Text style={s.cardMeta} numberOfLines={1}>
            {PLATFORM_LABEL[v.data.platform] ?? "Video"}
            {first ? ` · ${first.ingredients.length} ingredients` : ""}
            {more > 0 ? ` · +${more} more recipe${more > 1 ? "s" : ""}` : ""}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    list: { padding: 16, paddingBottom: 48, gap: 10, maxWidth: 720, width: "100%", alignSelf: "center" },
    header: { gap: 12, marginBottom: 4 },
    lede: { color: t.muted, fontSize: 15, lineHeight: 21 },
    inputRow: { flexDirection: "row" },
    input: {
      flex: 1,
      backgroundColor: t.card,
      borderColor: t.border,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === "ios" ? 14 : 10,
      fontSize: 16,
      color: t.text,
    },
    search: { flex: 0, paddingVertical: Platform.OS === "ios" ? 10 : 8, fontSize: 15 },
    buttonRow: { flexDirection: "row", gap: 10 },
    btn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    btnPrimary: { backgroundColor: t.accent },
    btnPrimaryText: { color: t.accentText, fontWeight: "700", fontSize: 16 },
    btnSecondary: { backgroundColor: t.accentSoft },
    btnSecondaryText: { color: t.accent, fontWeight: "700", fontSize: 16 },
    error: { color: t.danger, fontSize: 14 },
    sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 16 },
    section: { fontSize: 20, fontWeight: "700", color: t.text },
    settingsLink: { color: t.accent, fontSize: 15, fontWeight: "600" },
    empty: { color: t.muted, textAlign: "center", marginTop: 24, lineHeight: 21 },
    card: {
      flexDirection: "row",
      gap: 12,
      alignItems: "center",
      backgroundColor: t.card,
      borderColor: t.border,
      borderWidth: 1,
      borderRadius: 14,
      padding: 10,
    },
    thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: t.accentSoft },
    thumbPlaceholder: { alignItems: "center", justifyContent: "center" },
    cardTitle: { fontSize: 16, fontWeight: "700", color: t.text },
    cardSub: { fontSize: 14, color: t.muted },
    cardMeta: { fontSize: 13, color: t.muted },
  });
