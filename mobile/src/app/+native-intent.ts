import { getShareExtensionKey } from "expo-share-intent";

// When another app shares into Recipe Taker, route straight to the extract screen.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) {
      return "/extract?shared=1";
    }
    return path;
  } catch {
    return "/";
  }
}
