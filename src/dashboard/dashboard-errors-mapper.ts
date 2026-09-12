import { IDevToolsError, IDevToolsTrace } from "../types";

export default class DashboardErrorMapper {
    map(trace: IDevToolsTrace): IDevToolsError[] {
        return trace.spans
            .filter(span => span.error)
            .map(span => ({
                spanId: span.spanId,
                spanName: span.name,
                spanType: span.type,
                type: span.error?.type,
                message: span.error?.message,
                stack: span.error?.stack,
                startedAt: span.startedAt,
            }));
    }
}