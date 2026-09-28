/**
 * Where the e2e servers listen and who signs in. Shared by the Playwright
 * config (which passes them to radicale.sh) and the tests. The ports are
 * off the Radicale and Vite defaults, so a developer's own servers are
 * never reused or written to.
 */
export const RADICALE_PORT = 5299;
export const RADICALE_URL = `http://127.0.0.1:${RADICALE_PORT}`;
export const APP_URL = "http://127.0.0.1:4299";
export const USER = "alice";
export const PASSWORD = "alice-password";
