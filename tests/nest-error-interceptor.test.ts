import assert from 'node:assert/strict';
import { of, throwError, lastValueFrom } from 'rxjs';
import { SpanStatusCode, trace } from '@opentelemetry/api';

///@ts-ignoreß
import ServerDevToolsNestInterceptor from '../src/integrations/nestjs/server-devtools-nest.interceptor';

const interceptor = new ServerDevToolsNestInterceptor();

let recordedError: unknown;
let recordedStatus: unknown;

const fakeSpan = {
  recordException(error: unknown) {
    recordedError = error;
  },

  setStatus(status: unknown) {
    recordedStatus = status;
  },
};

const originalGetActiveSpan = trace.getActiveSpan;

(trace as any).getActiveSpan = () => fakeSpan;

const error = new Error('Something went wrong');

const next = {
  handle() {
    return throwError(() => error);
  },
};


async function run() {
  try {
    await lastValueFrom(
      interceptor.intercept({} as any, next as any),
    );

    assert.fail('Expected interceptor to rethrow');
  } catch (caughtError) {
    assert.equal(caughtError, error);
  }
}

run();

assert.equal(recordedError, error);

assert.deepEqual(recordedStatus, {
  code: SpanStatusCode.ERROR,
  message: 'Something went wrong',
});

(trace as any).getActiveSpan = originalGetActiveSpan;