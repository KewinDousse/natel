const CORE = "(0|[1-9][0-9]*)";
const VERSION = new RegExp(
  `^${CORE}\\.${CORE}\\.${CORE}(?:-([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?$`,
);

export function parseVersion(value: string): { core: bigint[]; pre: string[] } | null {
  if (value.trim() !== value || value.length > 80) return null;
  const match = VERSION.exec(value);
  if (!match) return null;
  const pre = match[4]?.split(".") ?? [];
  if (pre.some((part) => /^0[0-9]+$/.test(part))) return null;
  return { core: match.slice(1, 4).map((part) => BigInt(part)), pre };
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) throw new Error("Invalid release version");
  for (let i = 0; i < 3; i++) {
    const x = a.core[i] ?? 0n;
    const y = b.core[i] ?? 0n;
    if (x !== y) return x > y ? 1 : -1;
  }
  if (!a.pre.length || !b.pre.length) return Number(!a.pre.length) - Number(!b.pre.length);
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const nx = /^[0-9]+$/.test(x);
    const ny = /^[0-9]+$/.test(y);
    if (nx && ny) return BigInt(x) > BigInt(y) ? 1 : -1;
    if (nx !== ny) return nx ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}

export function releaseUrl(version: string): string {
  return `https://github.com/KewinDousse/natel/releases/tag/v${version}`;
}

export function isStableVersion(value: string): boolean {
  const version = parseVersion(value);
  return version !== null && version.pre.length === 0;
}
