function normalizeMongoFilterShape(value: unknown): unknown {
    if (value === null || typeof value !== "object") {
        return "?";
    }

    if (Array.isArray(value)) {
        return value.map((item) => normalizeMongoFilterShape(item));
    }

    const record = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};

    for (const key of Object.keys(record).sort()) {
        normalized[key] = normalizeMongoFilterShape(record[key]);
    }

    return normalized;
}

export function mongodbDatabaseGroupKey(
    attributes: Record<string, unknown>,
): string | undefined {
    if (attributes["db.system.name"] !== "mongodb") {
        return undefined;
    }

    const collection = attributes["db.collection.name"];
    const operation = attributes["db.operation.name"];
    if (typeof collection !== "string" || collection.trim() === "") {
        return undefined;
    }

    if (typeof operation !== "string" || operation.trim() === "") {
        return undefined;
    }

    const queryText = attributes["db.query.text"];
    if (typeof queryText === "string" && queryText.trim() !== "") {
        try {
            const parsed = JSON.parse(queryText) as unknown;
            const shape = JSON.stringify(normalizeMongoFilterShape(parsed));
            return `mongodb:${operation}@${collection}:${shape}`;
        } catch {
            return `mongodb:${operation}@${collection}`;
        }
    }

    return `mongodb:${operation}@${collection}`;
}