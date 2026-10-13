import type { Ref } from "react";
import { type GuideInline, parseUserGuide } from "@/lib/user-guide";
import markdown from "../../docs/user-guide.md?raw";
import { FOCUS_RING } from "./button";

const guide = parseUserGuide(markdown);

export function UserGuideContent({ headingRef }: { headingRef?: Ref<HTMLHeadingElement> }) {
  return (
    <article lang="en">
      {guide.map((block) => {
        const content = block.content.map(inline);
        if (block.kind === "title") {
          return (
            <h1
              key={block.offset}
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-title-sm font-bold leading-none outline-none sm:text-title lg:text-person"
            >
              {content}
            </h1>
          );
        }
        if (block.kind === "heading") {
          return (
            <h2 key={block.offset} className="mb-4 mt-8 border-t pt-4 text-base font-bold">
              {content}
            </h2>
          );
        }
        return (
          <p key={block.offset} className="my-4 text-base lg:text-body">
            {content}
          </p>
        );
      })}
    </article>
  );
}

function inline(token: GuideInline) {
  switch (token.kind) {
    case "text":
      return token.text;
    case "strong":
      return <strong key={token.offset}>{token.text}</strong>;
    case "code":
      return <code key={token.offset}>{token.text}</code>;
    case "link":
      return (
        <a
          key={token.offset}
          href={token.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex min-h-10 items-center rounded-sm font-bold underline decoration-leader underline-offset-2 hover:decoration-foreground ${FOCUS_RING}`}
        >
          {token.text}
        </a>
      );
  }
}
