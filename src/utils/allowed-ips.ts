import { isIP } from "node:net";

import { normalizeRemoteAddress } from "./helpers";

export function normalizeAllowedIp(ip: string): string {
    const trimmed = ip.trim();
    if (trimmed === "") {
        throw new Error("ServerDevTools allowedIPs entries must not be empty");
    }

    if (isIP(trimmed) === 0) {
        throw new Error(
            `ServerDevTools allowedIPs contains an invalid IP address: ${ip}`,
        );
    }

    return normalizeRemoteAddress(trimmed);
}

export function parseAllowedIps(allowedIPs?: string[]): Set<string> | undefined {
    if (allowedIPs === undefined || allowedIPs.length === 0) {
        return undefined;
    }

    const parsed = new Set<string>();
    for (const ip of allowedIPs) {
        parsed.add(normalizeAllowedIp(ip));
    }

    return parsed;
}

export function isRequestIpAllowed(
    remoteAddress: string | undefined,
    allowedIPs?: Set<string>,
): boolean {
    if (!allowedIPs) {
        return true;
    }

    return allowedIPs.has(normalizeRemoteAddress(remoteAddress));
}