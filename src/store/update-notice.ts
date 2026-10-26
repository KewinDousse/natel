import { create } from "zustand";
import { isStableVersion } from "@/lib/release-version";

const IGNORED_KEY = "natel.ignoredRelease";
const SEEN_KEY = "natel.seenRelease";

function read(key: string): string | null {
  try {
    const value = localStorage.getItem(key);
    return value && isStableVersion(value) ? value : null;
  } catch {
    return null;
  }
}

function write(key: string, version: string) {
  try {
    localStorage.setItem(key, version);
  } catch {
    // The choice still applies to this tab when storage is unavailable.
  }
}

export const useUpdateNotice = create<{
  ignored: string | null;
  /** The release the settings last showed, which clears the settings badge. */
  seen: string | null;
  ignore: (version: string) => void;
  see: (version: string) => void;
}>()((set, get) => ({
  ignored: read(IGNORED_KEY),
  seen: read(SEEN_KEY),
  ignore: (version) => {
    write(IGNORED_KEY, version);
    set({ ignored: version });
  },
  see: (version) => {
    if (get().seen === version) return;
    write(SEEN_KEY, version);
    set({ seen: version });
  },
}));
