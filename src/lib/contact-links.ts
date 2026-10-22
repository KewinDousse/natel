/**
 * An http or https URL: the only kind a draft may hold, and the only kind
 * the contact page turns into a link, whatever another client wrote.
 */
export function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * What each scheme would read in a value as fields, an escape or a parameter
 * (RFC 6068, 5724, 3966). A `,` stays: it adds a recipient the user sees, or
 * a pause in a number.
 */
const URI_SYNTAX = { mailto: /[%?#&;=]/g, sms: /[%?#]/g, tel: /[%?#]/g };

/**
 * The link to a number or an address of a card, with the characters its
 * scheme would read as syntax encoded: `?` would start the URI's own fields
 * (a hidden copy, a prefilled body), `%` an escape. A phone dials `%23` as
 * `#` (RFC 3966), and a number's `;ext=` stays a parameter.
 */
export function valueHref(scheme: "mailto" | "sms" | "tel", value: string): string {
  return `${scheme}:${value.replace(URI_SYNTAX[scheme], (char) => encodeURIComponent(char))}`;
}
