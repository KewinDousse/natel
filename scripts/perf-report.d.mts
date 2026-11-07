export type BookOpeningReport = {
  contacts: number;
  status: "complete" | "incomplete";
  failure?: string;
  samplesMs: number[];
  medianMs: number | null;
  browser?: string;
  platform?: string;
  cpu?: string;
  node?: string;
};
export function readBenchmarks(results: unknown): BookOpeningReport[];
export function renderReport(input: {
  base: BookOpeningReport[];
  head: BookOpeningReport[];
  baseSha: string;
  headSha: string;
}): string;
