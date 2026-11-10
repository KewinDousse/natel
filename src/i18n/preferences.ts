/**
 * Stored display preferences (ADR 019) and each book's group format
 * (ADR 052): only the user's explicit choices, in localStorage under one key.
 * Storage is best effort: when it is missing or throws, preferences live in
 * memory for the tab. Nothing sensitive ever goes there (invariant 3).
 */

export const PREFERENCES_KEY = "natel.preferences";

type StoredPreferences = Record<string, unknown>;

function isRecord(value: unknown): value is StoredPreferences {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function choiceOf<L extends string>(value: unknown, supported: readonly L[]): L | null {
  return supported.find((choice) => choice === value) ?? null;
}

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
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** A stored choice among `supported`; an unsupported or missing one is null. */
export function storedChoice<L extends string>(field: string, supported: readonly L[]): L | null {
  return choiceOf(readStored()[field], supported);
}

/** The choices stored as a map under `field`, each among `supported`. */
export function storedChoices<L extends string>(
  field: string,
  supported: readonly L[],
): Record<string, L> {
  const value = readStored()[field];
  if (!isRecord(value)) return {};
  const choices: Record<string, L> = {};
  for (const [key, choice] of Object.entries(value)) {
    const known = choiceOf(choice, supported);
    if (known !== null) choices[key] = known;
  }
  return choices;
}

/**
 * Store the choice `key` of the map under `field`, or remove it with null.
 * The map's other entries, known or not, are kept; it goes once empty.
 */
export function storeChoiceIn(field: string, key: string, value: string | null): void {
  const stored = readStored();
  const current = stored[field];
  const map = isRecord(current) ? { ...current } : {};
  if (value === null) delete map[key];
  else map[key] = value;
  write(field, Object.keys(map).length === 0 ? null : map, stored);
}

/**
 * Store an explicit choice, or remove it with null (the browser default then
 * applies). Other fields, known or not, are kept; the key goes once empty.
 */
export function storeChoice(field: string, value: string | null): void {
  write(field, value);
}

function write(field: string, value: unknown, stored = readStored()): void {
  const next = { ...stored };
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
