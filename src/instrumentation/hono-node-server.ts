import { context, trace } from "@opentelemetry/api";
import {
    InstrumentationBase,
    InstrumentationNodeModuleDefinition,
} from "@opentelemetry/instrumentation";

import { debugLog } from "../utils/logger";

type AnyFunction = (...args: any[]) => any;
type MarkedFunction = AnyFunction & {
    [wrappedListener]?: true;
};

type HonoNodeServerExports = {
    getRequestListener?: AnyFunction;
};

const wrappedFetch = Symbol("server-devtools.hono.wrapped-fetch");
const wrappedListener = Symbol("server-devtools.hono.wrapped-listener");

export class HonoNodeServerInstrumentation extends InstrumentationBase {
    constructor() {
        super("server-devtools-hono-node-server", "0.1.5", {});
    }

    protected init() {
        return new InstrumentationNodeModuleDefinition(
            "@hono/node-server",
            [">=2.0.0 <3"],
            (moduleExports: HonoNodeServerExports) => {
                if (typeof moduleExports.getRequestListener !== "function") {
                    return moduleExports;
                }

                const exportsWithListener = moduleExports as {
                    getRequestListener: AnyFunction;
                };

                if ((exportsWithListener.getRequestListener as MarkedFunction)[wrappedListener]) {
                    return moduleExports;
                }

                this._wrap(
                    exportsWithListener,
                    "getRequestListener",
                    (original) => {
                        const listenerWithDiagnostics = function (this: unknown, ...args: any[]) {
                            const fetchCallback = args[0];

                            if (typeof fetchCallback !== "function" || fetchCallback[wrappedFetch]) {
                                return original.apply(this, args);
                            }

                            const fetchWithDiagnostics = function (this: unknown, ...fetchArgs: any[]) {
                                const span = trace.getSpan(context.active());
                                const spanContext = span?.spanContext();

                                debugLog("Hono getRequestListener callback reached", {
                                    hasValidSpanContext: spanContext
                                        ? trace.isSpanContextValid(spanContext)
                                        : false,
                                });

                                return fetchCallback.apply(this, fetchArgs);
                            };

                            Object.defineProperty(fetchWithDiagnostics, wrappedFetch, {
                                value: true,
                            });

                            return original.apply(this, [fetchWithDiagnostics, ...args.slice(1)]);
                        };

                        Object.defineProperty(listenerWithDiagnostics, wrappedListener, {
                            value: true,
                        });

                        return listenerWithDiagnostics;
                    },
                );

                return moduleExports;
            },
            (moduleExports: HonoNodeServerExports) => {
                if (typeof moduleExports?.getRequestListener === "function") {
                    this._unwrap(moduleExports, "getRequestListener");
                }
            },
        );
    }
}
