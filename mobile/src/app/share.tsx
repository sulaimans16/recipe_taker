// Web Share Target: when the installed web app is picked from Android's share sheet,
// the browser opens /share?title=…&text=…&url=…
import { Redirect, useLocalSearchParams } from "expo-router";
import { findUrl } from "../lib/api";

export default function ShareTarget() {
  const { url, text, title } = useLocalSearchParams<{ url?: string; text?: string; title?: string }>();
  const link = findUrl([url, text, title].filter(Boolean).join(" "));
  if (!link) return <Redirect href="/" />;
  return <Redirect href={{ pathname: "/extract", params: { url: link } }} />;
}
