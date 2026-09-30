/**
 * Stored display preferences (ADR 019): only the user's explicit choices,
 * in localStorage under one key.
 * Storage is best effort: when it is missing or throws, preferences live in
 * memory for the tab. Nothing sensitive ever goes there (invariant 3).
 */

export const PREFERENCES_KEY = "natel.preferences";

type StoredPreferences = Record<string, unknown>;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The stored object; anything that isn't a JSON object reads as `{}`. */
function readStored(): StoredPreferences {
  try {
    const parsed: unknown = JSON.parse(storage()?.getItem(PREFERENCES_KEY) ?? "{}");
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as StoredPreferences)
      : {};
  } catch {
    return {};
  }
}

/** A stored choice among `supported`; an unsupported or missing one is null. */
export function storedChoice<L extends string>(field: string, supported: readonly L[]): L | null {
  const value = readStored()[field];
  return supported.find((choice) => choice === value) ?? null;
}

/**
 * Store an explicit choice, or remove it with null (the browser default then
 * applies). Other fields, known or not, are kept; the key goes once empty.
 */
export function storeChoice(field: string, value: string | null): void {
  const next = { ...readStored() };
  if (value === null) delete next[field];
  else next[field] = value;
  try {
    const store = storage();
    if (!store) return;
    if (Object.keys(next).length === 0) store.removeItem(PREFERENCES_KEY);
    else store.setItem(PREFERENCES_KEY, JSON.stringify(next));
  } catch {
    // Best effort: the choice still applies in memory.
  }
}
