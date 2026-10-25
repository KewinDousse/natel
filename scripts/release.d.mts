export function promotion(
  version: string,
  releases: { tag_name?: string; draft?: boolean; prerelease?: boolean }[],
): { latest: boolean; minor: boolean };

export function assertReleaseOwner(): void;
