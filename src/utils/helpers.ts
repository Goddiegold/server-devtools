export function normalizeRemoteAddress(address: string | undefined): string {
    if (!address) {
        return "unknown";
    }

    const normalized = address.toLowerCase();
    return normalized.startsWith("::ffff:")
        ? normalized.slice("::ffff:".length)
        : normalized;
}
