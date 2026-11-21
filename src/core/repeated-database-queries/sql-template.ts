import { utf8ByteLength } from "./utf8-byte-length";

/** Upper bound for normalizing captured SQL before fingerprinting. */
export const MAX_SQL_TEMPLATE_INPUT_LENGTH = 8_192;

function hasMultipleSqlStatements(query: string): boolean {
    let depth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let index = 0; index < query.length; index += 1) {
        const char = query[index];
        const next = query[index + 1];

        if (inSingleQuote) {
            if (char === "'" && next === "'") {
                index += 1;
                continue;
            }
            if (char === "'") {
                inSingleQuote = false;
            }
            continue;
        }

        if (inDoubleQuote) {
            if (char === "\\") {
                index += 1;
                continue;
            }
            if (char === "\"") {
                inDoubleQuote = false;
            }
            continue;
        }

        if (char === "'") {
            inSingleQuote = true;
            continue;
        }

        if (char === "\"") {
            inDoubleQuote = true;
            continue;
        }

        if (char === "(") {
            depth += 1;
            continue;
        }

        if (char === ")") {
            depth = Math.max(0, depth - 1);
            continue;
        }

        if (char === ";" && depth === 0) {
            const remainder = query.slice(index + 1).trim();
            if (remainder !== "") {
                return true;
            }
        }
    }

    return false;
}

export function normalizeSqlTemplate(query: string): string | undefined {
    if (typeof query !== "string") {
        return undefined;
    }

    const trimmed = query.trim();
    if (trimmed === "") {
        return undefined;
    }

    if (utf8ByteLength(trimmed) > MAX_SQL_TEMPLATE_INPUT_LENGTH) {
        return undefined;
    }

    if (hasMultipleSqlStatements(trimmed)) {
        return undefined;
    }

    let normalized = trimmed.replace(/\s+/g, " ");
    normalized = normalized.replace(/\$\d+/g, "?");
    normalized = normalized.replace(/'(?:''|[^'])*'/g, "?");
    normalized = normalized.replace(/"(?:[^"\\]|\\.)*"/g, "?");
    normalized = normalized.replace(/\bin\s*\([^)]+\)/gi, "in (?)");
    normalized = normalized.replace(/=\s*-?\d+(?:\.\d+)?/g, "= ?");
    normalized = normalized.replace(/,\s*-?\d+(?:\.\d+)?(?=\s*[),])/g, ", ?");
    normalized = normalized.replace(/values\s*\([^)]+\)/gi, "values (?)");
    return normalized.toLowerCase();
}