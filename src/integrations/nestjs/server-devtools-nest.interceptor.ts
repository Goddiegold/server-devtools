import {
    CallHandler,
    ExecutionContext,
    NestInterceptor,
} from "@nestjs/common";
import { trace } from "@opentelemetry/api";
import { Observable, catchError, throwError } from "rxjs";

import { recordSpanError } from "../../track";

export default class ServerDevToolsNestInterceptor implements NestInterceptor {
    intercept(_executionContext: ExecutionContext, next: CallHandler): Observable<unknown> {
        return next.handle().pipe(
            catchError((error: unknown) => {
                const activeSpan = trace.getActiveSpan();
                if (activeSpan) {
                    recordSpanError(activeSpan, error);
                }

                return throwError(() => error);
            }),
        );
    }
}