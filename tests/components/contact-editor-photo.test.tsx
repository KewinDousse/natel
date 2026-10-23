import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ContactEditorPhoto } from "@/components/contact-editor-photo";
import { I18nProvider } from "@/i18n/react";
import { buildDraft } from "@/lib/contact-edit";
import { parse } from "@/vcard";

afterEach(cleanup);

it("keeps the selected file attached until the picker opens again, including the same file", async () => {
  const contact = parse(
    "BEGIN:VCARD\r\nVERSION:3.0\r\nUID:photo-test\r\nFN:Photo Test\r\nEND:VCARD",
  );
  const input = createRef<HTMLInputElement>();
  const onFile = vi.fn();
  render(
    <I18nProvider>
      <ContactEditorPhoto
        contact={contact}
        draft={buildDraft(contact)}
        dispatch={vi.fn()}
        isNew={false}
        photo={{
          canChange: true,
          shown: false,
          inputRef: input,
          buttonRef: createRef<HTMLButtonElement>(),
          onFile,
        }}
      />
    </I18nProvider>,
  );
  const fileInput = input.current;
  if (!fileInput) throw new Error("Missing photo input");
  const user = userEvent.setup();
  const file = new File([new Uint8Array([1, 2, 3])], "camera.jpg", { type: "image/jpeg" });

  await user.upload(fileInput, file);
  expect(onFile).toHaveBeenCalledExactlyOnceWith(file);
  expect(fileInput.files?.[0]).toBe(file);

  await user.click(screen.getByRole("button", { name: /Change photo|Changer la photo/ }));
  expect(fileInput.files).toHaveLength(0);
  await user.upload(fileInput, file);
  expect(onFile).toHaveBeenCalledTimes(2);
  expect(fileInput.files?.[0]).toBe(file);
});
