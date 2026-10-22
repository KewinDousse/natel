import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { DavAddressBook } from "@/dav/types";
import { createQueryClient } from "@/queries/client";
import { contactsKey } from "@/queries/keys";
import type { MoveOutcome } from "@/queries/moveContact";
import type { LoadFullBookResult } from "@/queries/useContacts";
import { useMoveContact } from "@/queries/useMoveContact";
import { parse } from "@/vcard";

const { move } = vi.hoisted(() => ({ move: vi.fn<() => Promise<MoveOutcome>>() }));
vi.mock("@/queries/moveContact", () => ({ moveContact: move }));

const AUTH = { username: "alice" };
const SOURCE: DavAddressBook = { href: "https://dav.example.org/source/", displayName: "Source" };
const TARGET: DavAddressBook = { href: "https://dav.example.org/target/", displayName: "Target" };
const OTHER: DavAddressBook = { href: "https://dav.example.org/other/", displayName: "Other" };
const TEXT = "BEGIN:VCARD\r\nVERSION:3.0\r\nUID:one\r\nFN:One\r\nEND:VCARD\r\n";
const source = parse(TEXT, `${SOURCE.href}one.vcf`, '"source"');
const neighbour = parse(TEXT.replaceAll("one", "two"), `${SOURCE.href}two.vcf`, '"two"');

function setup() {
  const client = createQueryClient();
  const book = {
    contacts: [source, neighbour],
    groups: [],
    skipped: [],
  } satisfies LoadFullBookResult;
  client.setQueryData(contactsKey(AUTH, SOURCE), book);
  client.setQueryData(contactsKey(AUTH, TARGET), { ...book, contacts: [neighbour] });
  client.setQueryData(contactsKey(AUTH, OTHER), book);
  const { result } = renderHook(() => useMoveContact(AUTH), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  const run = async () => {
    await act(async () => {
      await result.current.mutateAsync({ contact: source, sourceBook: SOURCE, targetBook: TARGET });
    });
  };
  return { client, run, book };
}

describe("useMoveContact", () => {
  it("moves only the contact between cached books, keeping the returned text and ETag together", async () => {
    move.mockResolvedValue({
      kind: "moved",
      href: `${TARGET.href}one.vcf`,
      etag: '"target"',
      text: TEXT,
    });
    const { client, run } = setup();
    await run();
    expect(client.getQueryData<LoadFullBookResult>(contactsKey(AUTH, SOURCE))?.contacts).toEqual([
      neighbour,
    ]);
    const target = client.getQueryData<LoadFullBookResult>(contactsKey(AUTH, TARGET));
    expect(target?.contacts[0]).toBe(neighbour);
    expect(target?.contacts[1]).toMatchObject({
      href: `${TARGET.href}one.vcf`,
      etag: '"target"',
      uid: "one",
    });
    expect(target?.contacts[1]?.raw.toString()).toBe(parse(TEXT).raw.toString());
    expect(move).toHaveBeenCalledWith(AUTH, source, TARGET.href);
    expect(client.getQueryData<LoadFullBookResult>(contactsKey(AUTH, OTHER))?.contacts).toEqual([
      source,
      neighbour,
    ]);
  });

  it.each([
    ["exists", false, true],
    ["create_uncertain", true, true],
    ["in_both", true, true],
    ["delete_uncertain", true, true],
    ["stale", false, false],
  ] as const)(
    "invalidates the affected books for %s without inventing their contents",
    async (kind, sourceInvalid, targetInvalid) => {
      move.mockResolvedValue({ kind });
      const { client, run, book } = setup();
      await run();
      expect(client.getQueryState(contactsKey(AUTH, SOURCE))?.isInvalidated).toBe(sourceInvalid);
      expect(client.getQueryState(contactsKey(AUTH, TARGET))?.isInvalidated).toBe(targetInvalid);
      expect(client.getQueryState(contactsKey(AUTH, OTHER))?.isInvalidated).toBe(false);
      expect(client.getQueryData(contactsKey(AUTH, SOURCE))).toEqual(book);
    },
  );
});
