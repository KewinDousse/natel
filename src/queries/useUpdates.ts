import { useQuery } from "@tanstack/react-query";
import { IS_DEMO } from "@/lib/demo";
import { isStableVersion, releaseUrl } from "@/lib/release-version";

export type UpdateInfo = { enabled: boolean; version?: string; releaseUrl?: string };

export async function fetchUpdates(): Promise<UpdateInfo> {
  const response = await fetch("/updates", { mode: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error("Update check unavailable");
  const data: unknown = await response.json();
  if (
    typeof data !== "object" ||
    data === null ||
    !("enabled" in data) ||
    typeof data.enabled !== "boolean"
  ) {
    throw new Error("Invalid update information");
  }
  if (!data.enabled) return { enabled: false };
  if (!("version" in data)) return { enabled: true };
  if (
    typeof data.version !== "string" ||
    !isStableVersion(data.version) ||
    !("releaseUrl" in data) ||
    data.releaseUrl !== releaseUrl(data.version)
  ) {
    throw new Error("Invalid update information");
  }
  return { enabled: true, version: data.version, releaseUrl: data.releaseUrl };
}

export function useUpdates() {
  return useQuery({
    queryKey: ["updates"],
    queryFn: fetchUpdates,
    enabled: !IS_DEMO,
    staleTime: 24 * 60 * 60 * 1000,
    refetchInterval: 24 * 60 * 60 * 1000,
    retry: false,
  });
}
