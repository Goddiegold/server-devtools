import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { IDevToolsSpan, IDevToolsSpanType } from "../types";
import { SpanKind } from "@opentelemetry/api";
import RedactionService from "../security/redaction.service";


export default class SpanMapper {
    constructor(private readonly redactionService: RedactionService) { }

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

            attributes: this.redactHeaderAttributes(span.attributes),

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

    private redactHeaderAttributes(
        attributes: ReadableSpan["attributes"],
    ): Record<string, unknown> {
        const redactedAttributes: Record<string, unknown> = { ...attributes };
        const headerPrefixes = [
            "http.request.header.",
            "http.response.header.",
        ];

        for (const [key, value] of Object.entries(attributes)) {
            const normalizedKey = key.toLowerCase();
            const prefix = headerPrefixes.find((candidate) =>
                normalizedKey.startsWith(candidate),
            );

            if (!prefix) {
                continue;
            }

            const headerName = key.slice(prefix.length);
            const redactedHeader = this.redactionService.redactData({
                [headerName]: value,
            }) as Record<string, unknown>;

            redactedAttributes[key] = redactedHeader[headerName];
        }

        return redactedAttributes;
    }

    private getType(span: ReadableSpan): IDevToolsSpanType {
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
