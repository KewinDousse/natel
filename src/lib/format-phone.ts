/**
 * Phone-number display formatting.
 *
 * Uses libphonenumber-js (pre-approved) for display only. A valid number shows
 * in its own country's national format ("local", the default) or in
 * international format, as the settings choose. Any parse failure or
 * uncertainty returns the raw stored string untouched.
 *
 * tel: hrefs are built by valueHref from the RAW stored value; copy actions
 * and everything that touches the vCard keep it as is — this helper is
 * display only.
 */

import { type PhoneNumber, parsePhoneNumberFromString } from "libphonenumber-js";

export type PhoneFormat = "local" | "international";

/**
 * A phone number as each format displays it.
 *
 * - Valid numbers with a country code (+ or 00) → national format of that country
 *   ("079 000 00 01", "(212) 555-0166") in local, international format
 *   ("+41 79 000 00 01") in international.
 * - Valid numbers that belong to no country (+800, +870…) → international
 *   format in both modes, since the country code is what identifies them.
 * - Numbers stored without a country code that read as Swiss → read as Swiss
 *   numbers, as a Swiss address book writes them.
 * - Any parse failure, partial input, or uncertainty → raw string untouched.
 *
 * `extract: false` makes the parser require the whole string to be a phone
 * number, so stored values with stray characters never get parsed by prefix.
 */
export function phoneDisplays(raw: string): Record<PhoneFormat, string> {
  const display = (number: PhoneNumber) => {
    const international = number.format("INTERNATIONAL");
    const local = number.country === undefined ? international : number.format("NATIONAL");
    return { local, international };
  };
  const parsed = parsePhoneNumberFromString(raw, { extract: false });
  if (parsed?.isValid()) return display(parsed);
  const ch = parsePhoneNumberFromString(raw, { defaultCountry: "CH", extract: false });
  if (!ch?.isValid()) return { local: raw, international: raw };
  // From Switzerland, a leading 00 dials a country code, as + does.
  if (/^\s*00/.test(raw) || ch.country === "CH") return display(ch);
  return { local: raw, international: raw };
}

/** A phone number as `format` displays it (see phoneDisplays). */
export function formatPhone(raw: string, format: PhoneFormat): string {
  return phoneDisplays(raw)[format];
}
