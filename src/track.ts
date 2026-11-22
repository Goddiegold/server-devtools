import {
    Span,
    SpanKind,
    SpanStatusCode,
    trace,
} from "@opentelemetry/api";

export const SERVER_DEVTOOLS_TRACK_TYPE_ATTR = "server-devtools.type";
export const TRACK_METADATA_KEY = "server-devtools.track";
const NEST_HTTP_METHOD_METADATA = "method";
const TRACER_NAME = "server-devtools";

const customSpanAttributes = {
    kind: SpanKind.INTERNAL,
    attributes: {
        [SERVER_DEVTOOLS_TRACK_TYPE_ATTR]: "custom",
    },
} as const;

function isThenable(value: unknown): value is PromiseLike<unknown> {
    return (
        value !== null &&
        typeof value === "object" &&
        typeof (value as PromiseLike<unknown>).then === "function"
    );
}

export function recordSpanError(span: Span, error: unknown): void {
    if (error instanceof Error) {
        span.recordException(error);
    }

    span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
    });
}

function markSpanOk(span: Span): void {
    span.setStatus({ code: SpanStatusCode.OK });
}

export function runInTrackedSpan<T>(
    name: string,
    operation: () => T,
): T {
    const tracer = trace.getTracer(TRACER_NAME);

    return tracer.startActiveSpan(name, customSpanAttributes, (span) => {
        try {
            const result = operation();

            if (isThenable(result)) {
                return Promise.resolve(result).then(
                    (value) => {
                        markSpanOk(span);
                        span.end();
                        return value;
                    },
                    (error: unknown) => {
                        recordSpanError(span, error);
                        span.end();
                        throw error;
                    },
                ) as T;
            }

            markSpanOk(span);
            span.end();
            return result;
        } catch (error) {
            recordSpanError(span, error);
            span.end();
            throw error;
        }
    });
}

/** Nest route handlers already have HTTP spans — skip custom tracking on them. */
function isNestHttpRouteHandler(handler: object): boolean {
    if (typeof Reflect.hasMetadata !== "function") {
        return false;
    }

    return Reflect.hasMetadata(NEST_HTTP_METHOD_METADATA, handler);
}

/**
 * Method decorator for business-logic spans (services, helpers, domain classes).
 * Wraps the method with {@link runInTrackedSpan} so DB and outbound HTTP inside
 * the method become children of the custom span.
 */
export function Track(name: string): MethodDecorator {
    return (
        target: object,
        _propertyKey: string | symbol,
        descriptor: PropertyDescriptor,
    ) => {
        const original = descriptor.value;

        if (typeof original !== "function") {
            return descriptor;
        }

        if (isNestHttpRouteHandler(original)) {
            return descriptor;
        }

        descriptor.value = function (this: unknown, ...args: unknown[]) {
            return runInTrackedSpan(name, () => original.apply(this, args));
        };

        return descriptor;
    };
}