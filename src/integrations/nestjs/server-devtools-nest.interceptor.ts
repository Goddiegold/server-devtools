
import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import {
    SpanStatusCode,
    trace,
} from '@opentelemetry/api';
import { Observable, catchError, throwError } from 'rxjs';


export default class ServerDevToolsNestInterceptor implements NestInterceptor {
    intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
        return next.handle().pipe(
            catchError((error) => {
                const activeSpan = trace.getActiveSpan();
                if (activeSpan) {
                    activeSpan.recordException(error);
                    activeSpan.setStatus({
                        code: SpanStatusCode.ERROR,
                        message:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });
                }
                return throwError(() => error);
            })
        );
    }
}