/**
 * An http or https URL: the only kind the contact page turns into a link,
 * whatever the card holds.
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
 * A URI with a scheme (RFC 3986), as a vCard's URL holds (RFC 6350): what a
 * draft may hold, since a card can name an app's profile (`fb://profile/1`).
 */
export function isUri(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:\S+$/.test(value);
}

/** A host typed without a scheme, with an optional port and path. */
const BARE_HOST = /^[^\s/?#:@]+\.[^\s/?#:@]+(?::\d+)?(?:[/?#]\S*)?$/;

/**
 * What a typed website is saved as: a bare host becomes an https URL, since
 * a vCard's URL is a URI and a link needs a scheme. Anything else is kept.
 */
export function websiteUri(value: string): string {
  return BARE_HOST.test(value) ? `https://${value}` : value;
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
