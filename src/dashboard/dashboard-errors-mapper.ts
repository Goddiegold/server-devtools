import { IDevToolsError, IDevToolsTrace } from "../types";

function spanHasCapturedError(
    span: IDevToolsTrace["spans"][number],
): boolean {
    return Boolean(span.error) || span.status.code === 2;
}

function errorMessage(
    span: IDevToolsTrace["spans"][number],
): string | undefined {
    return span.error?.message
        ?? span.status.message
        ?? (span.status.code === 2 ? "Span reported an error status" : undefined);
}

export default class DashboardErrorMapper {
    map(trace: IDevToolsTrace): IDevToolsError[] {
        return trace.spans
            .filter(spanHasCapturedError)
            .sort((left, right) => left.startedAt - right.startedAt || left.spanId.localeCompare(right.spanId))
            .map(span => ({
                spanId: span.spanId,
                spanName: span.name,
                spanType: span.type,
                type: span.error?.type,
                message: errorMessage(span),
                stack: span.error?.stack,
                startedAt: span.startedAt,
            }));
    }
}