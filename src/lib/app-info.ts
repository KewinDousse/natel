import { version } from "../../package.json";

export const APP_VERSION = version;
export const APP_REVISION = import.meta.env.VITE_BUILD_REVISION ?? "";
