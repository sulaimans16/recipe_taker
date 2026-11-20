import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { deleteVideo, getVideo } from "../../lib/storage";
import { languageName, PLATFORM_LABEL, useTheme } from "../../lib/theme";
import type { Ingredient, RecipeContent, SavedVideo } from "../../lib/types";

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtIngredient(i: Ingredient) {
  return [i.quantity, i.unit].filter(Boolean).join(" ");
}

export default function RecipeScreen() {
  const t = useTheme();
  const s = styles(t);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [video, setVideo] = useState<SavedVideo | null | undefined>(undefined);
  const [index, setIndex] = useState(0);
  const [english, setEnglish] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    getVideo(id).then(setVideo);
  }, [id]);

  if (video === undefined) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  if (video === null) {
    return (
      <View style={[s.page, { alignItems: "center", paddingTop: 80 }]}>
        <Text style={s.muted}>This recipe was deleted.</Text>
      </View>
    );
  }

  const { data } = video;
  const recipe = data.recipes[Math.min(index, data.recipes.length - 1)];
  const hasEnglish = data.recipes.some((r) => r.english);
  const content: RecipeContent = english && recipe.english ? recipe.english : recipe;
  const langLabel = languageName(data.detected_language);

  const openSource = (sec?: number | null) => {
    if (!data.source_url) return;
    let url = data.source_url;
    if (sec != null && data.platform === "youtube") url += `&t=${Math.floor(sec)}s`;
    WebBrowser.openBrowserAsync(url);
  };

  const remove = () => {
    const go = async () => {
      await deleteVideo(video.id);
      router.replace("/");
    };
    if (Platform.OS === "web") {
      if (window.confirm("Delete this recipe?")) go();
    } else {
      Alert.alert("Delete recipe?", "This removes it from your device.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: go },
      ]);
    }
  };

  const meta = [
    content.servings && `Serves ${content.servings}`,
    content.prep_time && `Prep ${content.prep_time}`,
    content.cook_time && `Cook ${content.cook_time}`,
  ].filter(Boolean) as string[];

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={s.page}>
      <Stack.Screen options={{ title: "" }} />

      {data.recipes.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
          {data.recipes.map((r, i) => (
            <Pressable key={i} onPress={() => setIndex(i)} style={[s.tab, i === index && s.tabActive]}>
              <Text style={[s.tabText, i === index && s.tabTextActive]} numberOfLines={1}>
                {(english && r.english?.title) || r.title}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {hasEnglish && (
        <View style={s.segment}>
          {[false, true].map((en) => (
            <Pressable key={String(en)} onPress={() => setEnglish(en)} style={[s.segBtn, english === en && s.segActive]}>
              <Text style={[s.segText, english === en && s.segTextActive]}>{en ? "English" : langLabel}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={s.title}>{content.title}</Text>
      {content.description ? <Text style={s.desc}>{content.description}</Text> : null}
      {meta.length > 0 && (
        <View style={s.chips}>
          {meta.map((m) => (
            <Text key={m} style={s.chip}>
              {m}
            </Text>
          ))}
        </View>
      )}

      <Text style={s.h2}>Ingredients</Text>
      <View style={s.box}>
        {content.ingredients.map((ing, i) => {
          const key = `${index}-${i}`;
          const on = !!checked[key];
          const amount = fmtIngredient(ing);
          return (
            <Pressable
              key={key}
              onPress={() => setChecked((c) => ({ ...c, [key]: !on }))}
              style={[s.ingRow, i > 0 && s.rowBorder]}
            >
              <View style={[s.checkbox, on && s.checkboxOn]}>{on && <Text style={s.tick}>✓</Text>}</View>
              <Text style={[s.ingText, on && s.strike]}>
                {amount ? <Text style={s.amount}>{amount} </Text> : null}
                {ing.name}
                {ing.notes ? <Text style={s.muted}> · {ing.notes}</Text> : null}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={s.h2}>Steps</Text>
      <View style={{ gap: 14 }}>
        {content.steps.map((step, i) => {
          const sec = recipe.steps[i]?.timestamp_sec ?? step.timestamp_sec;
          return (
            <View key={i} style={s.stepRow}>
              <Text style={s.stepNum}>{i + 1}</Text>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={s.stepText}>{step.text}</Text>
                {sec != null && data.source_url ? (
                  <Pressable onPress={() => openSource(sec)}>
                    <Text style={s.timestamp}>▶ {fmtTime(sec)}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      {content.tips.length > 0 && (
        <>
          <Text style={s.h2}>Tips</Text>
          <View style={[s.box, { padding: 14, gap: 8 }]}>
            {content.tips.map((tip, i) => (
              <Text key={i} style={s.tip}>
                • {tip}
              </Text>
            ))}
          </View>
        </>
      )}

      <View style={s.footer}>
        {data.source_url ? (
          <Pressable onPress={() => openSource()}>
            <Text style={s.link}>
              Watch on {PLATFORM_LABEL[data.platform] ?? "source"}
              {data.author ? ` · ${data.author}` : ""}
            </Text>
          </Pressable>
        ) : null}
        <Pressable onPress={remove}>
          <Text style={[s.link, { color: t.danger }]}>Delete</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    page: { padding: 16, paddingBottom: 60, gap: 12, maxWidth: 720, width: "100%", alignSelf: "center" },
    tabs: { gap: 8 },
    tab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, maxWidth: 240 },
    tabActive: { backgroundColor: t.accent, borderColor: t.accent },
    tabText: { color: t.text, fontWeight: "600" },
    tabTextActive: { color: t.accentText },
    segment: { flexDirection: "row", backgroundColor: t.card, borderRadius: 10, borderWidth: 1, borderColor: t.border, padding: 3, alignSelf: "flex-start" },
    segBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8 },
    segActive: { backgroundColor: t.accentSoft },
    segText: { color: t.muted, fontWeight: "600" },
    segTextActive: { color: t.accent },
    title: { fontSize: 28, fontWeight: "800", color: t.text, lineHeight: 34 },
    desc: { fontSize: 16, color: t.muted, lineHeight: 22 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { backgroundColor: t.accentSoft, color: t.accent, fontWeight: "600", paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, overflow: "hidden", fontSize: 13 },
    h2: { fontSize: 20, fontWeight: "700", color: t.text, marginTop: 12 },
    box: { backgroundColor: t.card, borderRadius: 14, borderWidth: 1, borderColor: t.border },
    ingRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: t.border, alignItems: "center", justifyContent: "center" },
    checkboxOn: { backgroundColor: t.check, borderColor: t.check },
    tick: { color: "#fff", fontWeight: "900", fontSize: 13 },
    ingText: { flex: 1, fontSize: 16, color: t.text, lineHeight: 22 },
    amount: { fontWeight: "700" },
    strike: { textDecorationLine: "line-through", opacity: 0.5 },
    muted: { color: t.muted },
    stepRow: { flexDirection: "row", gap: 12 },
    stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: t.accent, color: t.accentText, textAlign: "center", lineHeight: 28, fontWeight: "800", overflow: "hidden" },
    stepText: { fontSize: 16, color: t.text, lineHeight: 23 },
    timestamp: { color: t.accent, fontWeight: "600", fontSize: 13 },
    tip: { fontSize: 15, color: t.text, lineHeight: 21 },
    footer: { flexDirection: "row", justifyContent: "space-between", marginTop: 20, gap: 12, flexWrap: "wrap" },
    link: { color: t.accent, fontWeight: "600", fontSize: 15 },
  });
