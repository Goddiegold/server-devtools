import Config from "../config";



class RedactionService {
    private readonly redactFields: Set<string>;
    private readonly allowRedacting: boolean

    constructor(
        allowRedacting: boolean,
        redactFields: string[],
    ) {
        this.allowRedacting = allowRedacting
        this.redactFields = new Set(
            redactFields
                .map(field => field?.trim().toLowerCase())
                .filter(Boolean)
        );
    }

    redactData(data: unknown): unknown {
        if (!this.allowRedacting) return data;

        if (Array.isArray(data)) {
            return data.map(item => this.redactData(item));
        }

        if (data !== null && typeof data === "object") {
            return Object.fromEntries(
                Object.entries(data).map(([key, value]) => {
                    if (
                        this.redactFields.has(key.toLowerCase()) &&
                        value !== undefined
                    ) {
                        return [key, Config.REDACTED_KEY];
                    }

                    return [key, this.redactData(value)];
                })
            );
        }

        return data;
    }



}

export default RedactionService;
