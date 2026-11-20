import { Stack, useRouter } from "expo-router";
import { ShareIntentProvider, useShareIntentContext } from "expo-share-intent";
import { useEffect } from "react";
import { Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTheme } from "../lib/theme";

function ShareListener() {
  const router = useRouter();
  const { hasShareIntent } = useShareIntentContext();
  useEffect(() => {
    // Covers a share arriving while the app is already open.
    if (hasShareIntent) router.push("/extract?shared=1");
  }, [hasShareIntent]);
  return null;
}

export default function RootLayout() {
  const t = useTheme();
  return (
    <ShareIntentProvider options={{ disabled: Platform.OS === "web", resetOnBackground: true }}>
      <ShareListener />
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Recipe Taker", headerLargeTitle: true }} />
        <Stack.Screen name="extract" options={{ title: "Reading video", headerBackTitle: "Back" }} />
        <Stack.Screen name="recipe/[id]" options={{ title: "", headerBackTitle: "Recipes" }} />
        <Stack.Screen name="settings" options={{ title: "Settings", presentation: "modal" }} />
      </Stack>
    </ShareIntentProvider>
  );
}
