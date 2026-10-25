import { create } from "zustand";
import { isStableVersion } from "@/lib/release-version";

const KEY = "natel.ignoredRelease";

function readIgnored(): string | null {
  try {
    const value = localStorage.getItem(KEY);
    return value && isStableVersion(value) ? value : null;
  } catch {
    return null;
  }
}

export const useUpdateNotice = create<{
  ignored: string | null;
  ignore: (version: string) => void;
}>()((set) => ({
  ignored: readIgnored(),
  ignore: (version) => {
    try {
      localStorage.setItem(KEY, version);
    } catch {
      // The dismissal still applies to this tab when storage is unavailable.
    }
    set({ ignored: version });
  },
}));
