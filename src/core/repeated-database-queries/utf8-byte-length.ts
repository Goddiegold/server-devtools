const textEncoder = typeof TextEncoder !== "undefined"
    ? new TextEncoder()
    : undefined;

export function utf8ByteLength(text: string): number {
    if (textEncoder) {
        return textEncoder.encode(text).length;
    }

    return text.length;
}