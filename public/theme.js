// The theme (ADR 026), set before the first paint so the page doesn't flash:
// the settings' choice, else the system's. src/lib/theme.ts keeps it up to date.
{
  let theme = null;
  try {
    const stored = JSON.parse(localStorage.getItem("natel.preferences") ?? "{}").theme;
    if (stored === "light" || stored === "dark") theme = stored;
  } catch {
    // No storage: the system setting applies.
  }
  document.documentElement.dataset.theme =
    theme ?? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  // The browser bar takes the chosen theme's colour too, as src/lib/theme.ts does.
  if (theme) {
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.dataset.system = meta.content;
      meta.content = theme === "dark" ? "#121316" : "#D8261D";
    }
  }
}
