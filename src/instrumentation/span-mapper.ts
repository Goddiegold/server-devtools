import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { IDevToolsSpan, DevToolsSpanType } from "../types";
import { SpanKind } from "@opentelemetry/api";


export default class SpanMapper {

    map(span: ReadableSpan): IDevToolsSpan {
        const context = span.spanContext();

        const exceptionEvent = span?.events?.find(
            (event) => event.name === 'exception',
        );

        return {
            traceId: context.traceId,
            spanId: context.spanId,
            parentSpanId: span.parentSpanContext?.spanId,

            type: this.getType(span),

            name: span.name,

            startedAt: this.hrTimeToMilliseconds(span.startTime),
            durationMs: this.hrTimeToMilliseconds(span.duration),

            attributes: {
                ...span.attributes,
            },

            status: {
                code: span.status.code,
                message: span.status.message,
            },
            error: exceptionEvent
                ? {
                    type:
                        exceptionEvent.attributes?.['exception.type']?.toString(),
                    message:
                        exceptionEvent.attributes?.['exception.message']?.toString(),
                    stack:
                        exceptionEvent.attributes?.['exception.stacktrace']?.toString(),
                }
                : undefined,
        }
    }

    private getType(span: ReadableSpan): DevToolsSpanType {
        if (span.attributes['db.system.name']) {
            return 'database';
        }

        if (span.attributes['express.type']) {
            return 'framework';
        }

        switch (span.kind) {
            case SpanKind.SERVER:
                return 'http.server';

            case SpanKind.CLIENT:
                return 'http.client';

            default:
                return 'unknown';
        }
    }

    private hrTimeToMilliseconds(time: [number, number]): number {
        const [seconds, nanoseconds] = time;

        return seconds * 1000 + nanoseconds / 1_000_000;
    }



}
