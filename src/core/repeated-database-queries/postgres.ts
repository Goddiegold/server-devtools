import { normalizeSqlTemplate } from "./sql-template";

export function postgresDatabaseGroupKey(
    attributes: Record<string, unknown>,
): string | undefined {
    if (attributes["db.system.name"] !== "postgresql") {
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

    return `postgresql:${template}`;
}