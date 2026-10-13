export type GuideInline =
  | { offset: number; kind: "text" | "strong" | "code"; text: string }
  | { offset: number; kind: "link"; text: string; href: string };

export type GuideBlock = {
  offset: number;
  kind: "title" | "heading" | "paragraph";
  content: GuideInline[];
};

const DOCS_URL = "https://github.com/KewinDousse/natel/blob/main/docs/";

/** Only the guide's markup is supported; fail checks when its syntax changes. */
export function parseUserGuide(source: string): GuideBlock[] {
  let offset = 0;
  return source
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      const heading = /^(#{1,2}) ([^\n]+)$/.exec(block);
      if (
        !heading &&
        /(^|\n)(?:\s{4}|#{1,6} |[-+*] |\d+[.)] |> ?|`{3}|~{3}|\||[-=]{2,}\s*$)/m.test(block)
      ) {
        throw new Error("Unsupported user-guide Markdown block");
      }
      offset += block.length;
      return {
        offset,
        kind: heading ? (heading[1] === "#" ? "title" : "heading") : "paragraph",
        content: parseInline(heading?.[2] ?? block.replace(/\n/g, " ")),
      };
    });
}

function plainText(text: string): string {
  if (/[*_`~[\]<>]/.test(text)) throw new Error("Unsupported user-guide Markdown inline syntax");
  return text;
}

function parseInline(text: string): GuideInline[] {
  if (/!\[/.test(text)) throw new Error("Unsupported user-guide Markdown image");
  const content: GuideInline[] = [];
  let offset = 0;
  for (const match of text.matchAll(/\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g)) {
    if (match.index > offset) {
      content.push({ offset, kind: "text", text: plainText(text.slice(offset, match.index)) });
    }
    if (match[1] !== undefined) {
      content.push({ offset: match.index, kind: "strong", text: plainText(match[1]) });
    } else if (match[2] !== undefined) {
      content.push({ offset: match.index, kind: "code", text: match[2] });
    } else if (match[3] !== undefined && match[4] !== undefined) {
      const href = new URL(match[4], DOCS_URL);
      if (href.protocol !== "https:") throw new Error("Unsupported user-guide link protocol");
      content.push({
        offset: match.index,
        kind: "link",
        text: plainText(match[3]),
        href: href.href,
      });
    }
    offset = match.index + match[0].length;
  }
  if (offset < text.length)
    content.push({ offset, kind: "text", text: plainText(text.slice(offset)) });
  return content;
}
