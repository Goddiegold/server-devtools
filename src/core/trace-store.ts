import { IDevToolsTrace } from "../types";


export default class TraceStore {
    private readonly traces = new Map<string, IDevToolsTrace>();

    constructor(private readonly maxTraces = 1000) { }

    add(trace: IDevToolsTrace): void {
        if (
            !this.traces.has(trace.traceId) &&
            this.traces.size >= this.maxTraces
        ) {
            const oldestTraceId = this.traces.keys().next().value;
            if(oldestTraceId) {
                this.traces.delete(oldestTraceId);
            }
        }

        this.traces.set(trace.traceId, trace);
    }

    get(traceId: string): IDevToolsTrace | undefined {
        return this.traces.get(traceId);
    }
    
    getAll(): IDevToolsTrace[] {
        return Array.from(this.traces.values());
    }

    clear(): void {
        this.traces.clear();
    }
}