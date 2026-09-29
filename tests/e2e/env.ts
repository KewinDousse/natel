/**
 * Where the e2e servers listen and who signs in. Shared by the Playwright
 * config (which starts the server) and the tests. The ports are off the
 * servers' and Vite's defaults, so a developer's own servers are never
 * reused or written to.
 *
 * E2E_SERVER picks the CardDAV server of the compatibility matrix the suite
 * runs against; Radicale when unset.
 */
export const DAV_PORT = 5299;
export const DAV_URL = `http://127.0.0.1:${DAV_PORT}`;
export const APP_URL = "http://127.0.0.1:4299";
export const USER = "alice";
export const PASSWORD = "alice-password";

type Server = {
  /** Starts the server on DAV_PORT, in the foreground, with empty storage. */
  command: string;
  /** Answers once the server is up. */
  readyPath: string;
  /** The user's address-book home, where the tests create their books. */
  home: string;
  /** False when the server leaves authentication to a proxy in front of it. */
  checksPassword: boolean;
};

const SERVERS = {
  radicale: {
    command: "tests/e2e/radicale.sh",
    readyPath: "/.well-known/carddav",
    home: `/${USER}/`,
    checksPassword: true,
  },
  xandikos: {
    command: "tests/e2e/xandikos.sh",
    readyPath: "/.well-known/carddav",
    home: `/${USER}/contacts/`,
    checksPassword: false,
  },
  baikal: {
    command: "tests/e2e/baikal.sh",
    readyPath: "/dav.php/",
    home: `/dav.php/addressbooks/${USER}/`,
    checksPassword: true,
  },
} satisfies Record<string, Server>;

export type ServerName = keyof typeof SERVERS;

function serverName(): ServerName {
  const name = process.env.E2E_SERVER || "radicale";
  if (!Object.hasOwn(SERVERS, name)) {
    throw new Error(`E2E_SERVER=${name}: expected one of ${Object.keys(SERVERS).join(", ")}`);
  }
  return name as ServerName;
}

export const SERVER_NAME = serverName();
export const SERVER: Server = SERVERS[SERVER_NAME];
