/**
 * Phone-number display formatting.
 *
 * Uses libphonenumber-js (pre-approved) for display only. Swiss numbers get
 * local format (e.g. 079 000 00 01), foreign numbers get international format.
 * Any parse failure or uncertainty returns the raw stored string untouched.
 *
 * tel: hrefs, copy actions, and everything that touches the vCard keep the RAW
 * stored value — this helper is display only.
 */

import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Format a phone number for display.
 *
 * - Swiss numbers (with or without +41) → local format ("079 000 00 01").
 * - Other valid numbers → international format ("+1 212 555 0166").
 * - Any parse failure, partial input, or uncertainty → raw string untouched.
 *
 * `extract: false` makes the parser require the whole string to be a phone
 * number, so stored values with stray characters never get parsed by prefix.
 */
export function formatPhone(raw: string): string {
  const parsed = parsePhoneNumberFromString(raw, { extract: false });
  if (parsed?.isValid()) {
    return parsed.country === "CH" ? parsed.format("NATIONAL") : parsed.format("INTERNATIONAL");
  }
  // Bare national numbers (no +) get one Swiss-context attempt, so values
  // stored as "079 000 00 01" still display in local format.
  const ch = parsePhoneNumberFromString(raw, { defaultCountry: "CH", extract: false });
  if (ch?.isValid() && ch.country === "CH") {
    return ch.format("NATIONAL");
  }
  return raw;
}
