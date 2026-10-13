import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { UserGuideContent } from "@/components/user-guide-content";
import { parseUserGuide } from "@/lib/user-guide";
import markdown from "../../docs/user-guide.md?raw";

afterEach(cleanup);

describe("the bundled English guide", () => {
  it("renders the real Markdown, including its title, formatting and documentation links", () => {
    const { container } = render(<UserGuideContent />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Using Natel");
    expect(container.querySelector("article")?.lang).toBe("en");
    expect(container.querySelector("strong")?.textContent).toBe("Settings → Sign out");
    expect(container.querySelector("code")?.textContent).toBe(".vcf");
    const link = screen.getByRole("link", { name: "compatibility" });
    expect(link.getAttribute("href")).toBe(
      "https://github.com/KewinDousse/natel/blob/main/docs/compatibility.md#groups",
    );
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(parseUserGuide(markdown).filter((block) => block.kind === "title")).toHaveLength(1);
  });

  it.each([
    "### A new heading",
    "- A list",
    "Text with *emphasis*",
    "_emphasis_",
    "---",
    "![image](https://example.com/image.png)",
    "<script>alert(1)</script>",
  ])("rejects unsupported syntax: %s", (source) =>
    expect(() => parseUserGuide(source)).toThrow(/Unsupported user-guide Markdown/),
  );

  it.each(["javascript:alert", "data:text/html,hello", "http://example.com"])(
    "rejects unsafe documentation link protocol: %s",
    (href) => expect(() => parseUserGuide(`[link](${href})`)).toThrow(/link protocol/),
  );
});
