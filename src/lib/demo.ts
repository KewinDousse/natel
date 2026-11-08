/** True in the demo build (ADR 025), where `@/dav` is an in-memory stand-in. */
export const IS_DEMO = import.meta.env.VITE_DEMO === "1";

/**
 * The contact the demo opens when a visitor arrives on a book's list on a
 * wide screen, by the book's slug and the card's UID in `src/dav/demo-seed.ts`:
 * an empty pane beside the list would show nothing of what Natel does.
 */
export const DEMO_ARRIVAL_CONTACT: ReadonlyMap<string, string> = new Map([
  ["runeterra", "p03"],
  ["expedition-33", "e08"],
]);
