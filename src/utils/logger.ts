import Config from "../config";

export function debugLog(message: string, data?: unknown): void {
    if (!Config.SERVER_DEVTOOLS_DEBUG) {
        return;
    }

    const prefix = `[ServerDevTools] ${message}`;

    if (data === undefined) {
        console.debug(prefix);
        return;
    }

    console.debug(prefix, data);
}
