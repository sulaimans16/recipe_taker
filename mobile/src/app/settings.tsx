import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { DEFAULT_API_URL, DEFAULT_APP_TOKEN } from "../lib/api";
import { getSetting, setSetting } from "../lib/storage";
import { useTheme } from "../lib/theme";

export default function Settings() {
  const t = useTheme();
  const s = styles(t);
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    getSetting("apiUrl").then((v) => setUrl(v || DEFAULT_API_URL));
    getSetting("appToken").then((v) => setToken(v ?? DEFAULT_APP_TOKEN));
  }, []);

  const save = async () => {
    const clean = url.trim().replace(/\/+$/, "");
    await setSetting("apiUrl", clean);
    await setSetting("appToken", token.trim());
    setStatus("Checking server…");
    try {
      const r = await fetch(`${clean}/health`);
      setStatus(r.ok ? "Saved. Server is reachable ✓" : `Saved, but the server answered ${r.status}.`);
    } catch {
      setStatus("Saved, but the server can't be reached from this phone.");
    }
  };

  return (
    <View style={s.page}>
      <Text style={s.label}>Server address</Text>
      <TextInput
        value={url}
        onChangeText={setUrl}
        style={s.input}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://your-recipe-server.example.com"
        placeholderTextColor={t.muted}
      />
      <Text style={s.help}>Where the Recipe Taker backend runs (it holds the Gemini key).</Text>
      <Text style={s.label}>App token</Text>
      <TextInput
        value={token}
        onChangeText={setToken}
        style={s.input}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        placeholder="Optional"
        placeholderTextColor={t.muted}
      />
      <Text style={s.help}>Must match APP_TOKEN on the server, if you set one.</Text>
      <Pressable style={s.btn} onPress={save}>
        <Text style={s.btnText}>Save</Text>
      </Pressable>
      {status && <Text style={s.help}>{status}</Text>}
      <Pressable onPress={() => router.back()}>
        <Text style={s.link}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    page: { flex: 1, padding: 16, gap: 8, backgroundColor: t.bg },
    label: { fontSize: 15, fontWeight: "700", color: t.text, marginTop: 12 },
    input: { backgroundColor: t.card, borderColor: t.border, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 16, color: t.text },
    help: { color: t.muted, fontSize: 13, lineHeight: 18 },
    btn: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 16 },
    btnText: { color: t.accentText, fontWeight: "700", fontSize: 16 },
    link: { color: t.accent, fontWeight: "600", fontSize: 15, textAlign: "center", marginTop: 12 },
  });
