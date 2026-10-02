/// <reference types="vite/client" />
/// <reference types="vitest/globals" />

interface ImportMetaEnv {
  /** "1" in the demo build (ADR 025). */
  readonly VITE_DEMO?: string;
}
