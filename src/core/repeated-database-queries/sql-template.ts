export function normalizeSqlTemplate(query: string): string {
    let normalized = query.trim().replace(/\s+/g, " ");
    normalized = normalized.replace(/\$\d+/g, "?");
    normalized = normalized.replace(/'(?:''|[^'])*'/g, "?");
    normalized = normalized.replace(/=\s*-?\d+(?:\.\d+)?/g, "= ?");
    normalized = normalized.replace(/,\s*-?\d+(?:\.\d+)?(?=\s*[),])/g, ", ?");
    return normalized.toLowerCase();
}