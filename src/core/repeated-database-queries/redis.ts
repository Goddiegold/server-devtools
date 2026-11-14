const REDIS_COMMANDS_MASKING_ALL_ARGS = new Set([
    "SET",
    "SETEX",
    "SETNX",
    "PSETEX",
    "GETSET",
    "MSET",
    "LPUSH",
    "RPUSH",
]);

const REDIS_COMMANDS_WITH_FIELD_ARG = new Set([
    "HGET",
    "HDEL",
    "HEXISTS",
    "HSET",
]);

function normalizeRedisArgument(command: string, argIndex: number, arg: string): string {
    const cmd = command.toUpperCase();

    if (REDIS_COMMANDS_MASKING_ALL_ARGS.has(cmd)) {
        return "?";
    }

    if (cmd === "HSET") {
        if (argIndex === 0) {
            return "?";
        }

        if (argIndex === 1) {
            return arg.toLowerCase();
        }

        return "?";
    }

    if (REDIS_COMMANDS_WITH_FIELD_ARG.has(cmd)) {
        if (argIndex === 0) {
            return "?";
        }

        if (argIndex === 1) {
            return arg.toLowerCase();
        }

        return "?";
    }

    if (argIndex === 0) {
        return "?";
    }

    return "?";
}

export function parseRedisCommandText(
    queryText: string,
): { command: string; args: string[] } | undefined {
    const trimmed = queryText.trim();
    if (trimmed === "") {
        return undefined;
    }

    const parts = trimmed.split(/\s+/);
    const command = parts[0]?.toUpperCase();
    if (!command) {
        return undefined;
    }

    return {
        command,
        args: parts.slice(1),
    };
}

export function normalizeRedisCommandPattern(
    command: string,
    args: string[],
): string {
    const normalizedArgs = args.map((arg, index) =>
        normalizeRedisArgument(command, index, arg),
    );

    return [command.toUpperCase(), ...normalizedArgs].join(" ").trim();
}

export function redisDatabaseGroupKey(
    attributes: Record<string, unknown>,
): string | undefined {
    if (attributes["db.system.name"] !== "redis") {
        return undefined;
    }

    const queryText = attributes["db.query.text"];
    if (typeof queryText === "string" && queryText.trim() !== "") {
        const parsed = parseRedisCommandText(queryText);
        if (parsed) {
            const pattern = normalizeRedisCommandPattern(parsed.command, parsed.args);
            return `redis:${pattern}`;
        }
    }

    const operation = attributes["db.operation.name"];
    if (typeof operation === "string" && operation.trim() !== "") {
        return `redis:${operation.trim().toUpperCase()}`;
    }

    return undefined;
}

export function formatRedisCommandPattern(groupKey: string): string {
    return groupKey.startsWith("redis:") ? groupKey.slice("redis:".length) : groupKey;
}