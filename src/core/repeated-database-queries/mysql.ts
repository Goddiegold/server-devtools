import { normalizeSqlTemplate } from "./sql-template";

export function mysqlDatabaseGroupKey(
    attributes: Record<string, unknown>,
): string | undefined {
    const system = attributes["db.system.name"];
    if (system !== "mysql" && system !== "mysql2") {
        return undefined;
    }

    const query = attributes["db.query.text"];
    if (typeof query !== "string") {
        return undefined;
    }

    const template = normalizeSqlTemplate(query);
    if (!template) {
        return undefined;
    }

    return `mysql:${template}`;
}