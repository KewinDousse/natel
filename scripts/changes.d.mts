export type ChangeType =
  | "Upgrade notes"
  | "Added"
  | "Changed"
  | "Deprecated"
  | "Removed"
  | "Fixed"
  | "Security"
  | "None";
export type ChangeNote = { type: ChangeType; text: string };
export function assemble(
  changelog: string,
  notes: ChangeNote[],
  version: string,
  date: string,
): string;
export function compareVersions(left: string, right: string): number;
export function readFragment(source: string): ChangeNote;
export function releaseNotes(changelog: string, version: string): string;
export function validateVersion(version: unknown): string;
