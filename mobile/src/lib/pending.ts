// Holds a picked video between the home screen and the extract screen
// (file objects can't be passed through route params).
import type { LocalVideo } from "./api";

let current: LocalVideo | null = null;

export const pendingUpload = {
  set(v: LocalVideo) {
    current = v;
  },
  take(): LocalVideo | null {
    const v = current;
    current = null;
    return v;
  },
};
