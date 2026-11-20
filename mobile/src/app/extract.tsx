import { useLocalSearchParams, useRouter } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { extractFromFile, extractFromLink, findUrl, type LocalVideo } from "../lib/api";
import { pendingUpload } from "../lib/pending";
import { saveVideo } from "../lib/storage";
import { useTheme } from "../lib/theme";

const STAGES = [
  "Fetching the video…",
  "Watching the video…",
  "Listening to the narration…",
  "Reading on-screen text and caption…",
  "Writing down ingredients…",
  "Putting the steps in order…",
  "Translating to English…",
];

type Job = { kind: "link"; text: string } | { kind: "file"; video: LocalVideo; caption?: string; sourceUrl?: string };

export default function Extract() {
  const t = useTheme();
  const s = styles(t);
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string; upload?: string; shared?: string }>();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  const [job, setJob] = useState<Job | null>(null);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const started = useRef<number>(-1);

  // Work out what to extract from.
  useEffect(() => {
    if (job) return;
    if (params.url) {
      setJob({ kind: "link", text: params.url });
    } else if (params.upload) {
      const v = pendingUpload.take();
      if (v) setJob({ kind: "file", video: v });
      else setError("No video selected.");
    } else if (params.shared && hasShareIntent) {
      const video = shareIntent.files?.find((f) => f.mimeType?.startsWith("video/"));
      const text = shareIntent.webUrl || shareIntent.text || "";
      if (video) {
        setJob({
          kind: "file",
          video: { uri: video.path, name: video.fileName || "video.mp4", mimeType: video.mimeType },
          caption: shareIntent.text || undefined,
          sourceUrl: findUrl(text) ?? undefined,
        });
      } else if (findUrl(text)) {
        setJob({ kind: "link", text });
      } else {
        setError("Nothing to read here. Share a reel/short link or a video file.");
      }
      resetShareIntent();
    }
  }, [params.url, params.upload, params.shared, hasShareIntent]);

  // Run the extraction.
  useEffect(() => {
    if (!job || started.current === attempt) return;
    started.current = attempt;
    setError(null);
    setStage(0);
    const timer = setInterval(() => setStage((i) => Math.min(i + 1, STAGES.length - 1)), 4000);
    const run =
      job.kind === "link"
        ? extractFromLink(job.text, attempt > 0)
        : extractFromFile(job.video, { caption: job.caption, sourceUrl: job.sourceUrl });
    run
      .then(async (data) => {
        if (!data.recipes.length) {
          setError(data.no_recipe_reason || "No recipe was found in this video.");
          return;
        }
        const id = await saveVideo(data);
        router.replace({ pathname: "/recipe/[id]", params: { id } });
      })
      .catch((e: Error) => setError(e.message || "Something went wrong."))
      .finally(() => clearInterval(timer));
    return () => clearInterval(timer);
  }, [job, attempt]);

  if (error) {
    return (
      <View style={s.center}>
        <Text style={s.emoji}>🤔</Text>
        <Text style={s.title}>Couldn't get a recipe</Text>
        <Text style={s.body}>{error}</Text>
        {job && (
          <Pressable style={s.btn} onPress={() => setAttempt((a) => a + 1)}>
            <Text style={s.btnText}>Try again</Text>
          </Pressable>
        )}
        <Pressable onPress={() => router.replace("/")}>
          <Text style={s.link}>Back to recipes</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.center}>
      <ActivityIndicator size="large" color={t.accent} />
      <Text style={s.title}>{STAGES[stage]}</Text>
      <Text style={s.body}>This usually takes 30–90 seconds.</Text>
    </View>
  );
}

const styles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 14, backgroundColor: t.bg },
    emoji: { fontSize: 44 },
    title: { fontSize: 20, fontWeight: "700", color: t.text, textAlign: "center" },
    body: { fontSize: 15, color: t.muted, textAlign: "center", lineHeight: 21, maxWidth: 420 },
    btn: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28, marginTop: 8 },
    btnText: { color: t.accentText, fontWeight: "700", fontSize: 16 },
    link: { color: t.accent, fontSize: 15, fontWeight: "600", marginTop: 4 },
  });
