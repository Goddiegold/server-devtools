import { ClientRequest, IncomingMessage } from "node:http";
import SQLiteStorage from "../../storage/sqlite-storage";
import { AsyncLocalStorage } from "node:async_hooks";
import { debugLog } from "../../utils/logger";
import Config from "../../config";
import {
  FetchCaptureContext,
  NativeBodyCaptureState,
} from "../../types/outbound-http";
import RedactionService from "../../security/redaction.service";

function captureNativeBodyChunk(
  state: NativeBodyCaptureState,
  chunk: unknown,
  encoding?: BufferEncoding,
): void {
  if (state.oversized || chunk === undefined || chunk === null) {
    return;
  }

  let buffer: Buffer;

  try {
    buffer = typeof chunk === "string"
      ? Buffer.from(chunk, encoding)
      : Buffer.from(chunk as any);
  } catch {
    state.oversized = true;
    state.chunks.length = 0;
    return;
  }

  if (state.bytes + buffer.length > Config.NATIVE_HTTP_BODY_LIMIT_BYTES) {
    state.oversized = true;
    state.chunks.length = 0;
    return;
  }

  state.chunks.push(buffer);
  state.bytes += buffer.length;
}

export class OutboundHttpCapture {
  private readonly fetchContext =
    new AsyncLocalStorage<FetchCaptureContext>();
  private readonly redactionService: RedactionService;

  private originalFetch?: typeof globalThis.fetch;
  private fetchWrapper?: typeof globalThis.fetch;
  private readonly pendingFetchCaptures = new Set<Promise<void>>();

  constructor(
    private readonly storage: SQLiteStorage,
    redactionService: RedactionService,
  ) {
    this.redactionService = redactionService;
  }

  trackNativeRequest(
    spanId: string,
    request: ClientRequest,
  ): void {
    debugLog("Native HTTP request capture started", {
      spanId,
      method: request.method,
      path: request.path.split("?")[0],
    });
    this.captureNativeRequestHeaders(spanId, request);
    this.captureNativeRequestBody(spanId, request);
  }

  trackNativeResponse(
    spanId: string,
    response: IncomingMessage,
  ): void {
    debugLog("Native HTTP response capture started", {
      spanId,
      statusCode: response.statusCode,
    });
    this.captureNativeResponseHeaders(spanId, response);
    this.captureNativeResponseBody(spanId, response);
  }

  private captureNativeRequestHeaders(
    spanId: string,
    request: ClientRequest,
  ): void {
    const headers = this.redactHeaders(this.normalizeHeaders(
      request.getHeaders(),
    ));

    try {
      this.storage.updateHttpClientDetails(spanId, {
        requestHeaders: headers,
      });
    } catch (error) {
      debugLog("HTTP client request-header capture failed", {
        spanId,
        errorName: error instanceof Error ? error.name : typeof error,
      });
    }
  }

  private captureNativeRequestBody(
    spanId: string,
    request: ClientRequest,
  ): void {
    const state: NativeBodyCaptureState = {
      chunks: [],
      bytes: 0,
      oversized: false,
    };

    const originalWrite = request.write.bind(request);
    const originalEnd = request.end.bind(request);

    request.write = ((chunk: any, ...args: any[]) => {
      captureNativeBodyChunk(
        state,
        chunk,
        typeof args[0] === "string" ? args[0] as BufferEncoding : undefined,
      );

      return originalWrite(chunk, ...args);
    }) as typeof request.write;

    request.end = ((chunk?: any, ...args: any[]) => {
      captureNativeBodyChunk(
        state,
        chunk,
        typeof args[0] === "string" ? args[0] as BufferEncoding : undefined,
      );

      if (!state.oversized && state.chunks.length > 0) {
        try {
          this.storage.updateHttpClientDetails(spanId, {
            requestBody: this.parseBody(
              Buffer.concat(state.chunks),
              request.getHeader("content-type"),
            ),
          });
        } catch (error) {
          debugLog("HTTP client request-body capture failed", {
            spanId,
            errorName: error instanceof Error ? error.name : typeof error,
          });
        }
      }

      return originalEnd(chunk, ...args);
    }) as typeof request.end;
  }

  private captureNativeResponseHeaders(
    spanId: string,
    response: IncomingMessage,
  ): void {
    const headers = this.redactHeaders(this.normalizeHeaders(
      response.headers,
    ));

    try {
      this.storage.updateHttpClientDetails(spanId, {
        responseHeaders: headers,
      });
    } catch (error) {
      debugLog("HTTP client response-header capture failed", {
        spanId,
        errorName: error instanceof Error ? error.name : typeof error,
      });
    }
  }

  private captureNativeResponseBody(
    spanId: string,
    response: IncomingMessage,
  ): void {
    const state: NativeBodyCaptureState = {
      chunks: [],
      bytes: 0,
      oversized: false,
    };

    response.on("data", (chunk) => {
      captureNativeBodyChunk(state, chunk);
    });

    response.once("end", () => {
      if (state.oversized || state.chunks.length === 0) {
        return;
      }

      try {
        this.storage.updateHttpClientDetails(spanId, {
          responseBody: this.parseBody(
            Buffer.concat(state.chunks),
            response.headers["content-type"],
          ),
        });
      } catch (error) {
        debugLog("HTTP client response-body capture failed", {
          spanId,
          errorName: error instanceof Error ? error.name : typeof error,
        });
      }
    });
  }

  private normalizeHeaders(
    headers: Record<
      string,
      string | string[] | number | undefined
    >,
  ): Record<string, string | string[]> {
    const normalized: Record<string, string | string[]> = {};

    for (const [name, value] of Object.entries(headers)) {
      if (value === undefined) {
        continue;
      }

      normalized[name] = Array.isArray(value)
        ? value.map(String)
        : String(value);
    }

    return normalized;
  }

  private parseBody(
    body: Buffer | string,
    contentType: string | string[] | number | null | undefined,
  ): unknown {
    const rawBody = typeof body === "string" ? body : body.toString("utf8");

    const normalizedContentType = Array.isArray(contentType)
      ? contentType.join(";")
      : String(contentType ?? "");

    if (
      normalizedContentType
        .toLowerCase()
        .includes("application/json")
    ) {
      try {
        return JSON.parse(rawBody);
      } catch {
        return rawBody;
      }
    }

    return rawBody;
  }

  startFetchCapture(): void {
    if (this.originalFetch) {
      debugLog("Fetch capture already active; skipping duplicate installation");
      return;
    }

    const originalFetch = globalThis.fetch;

    if (!originalFetch) {
      debugLog("Fetch capture unavailable; global fetch is missing");
      return;
    }

    this.originalFetch = originalFetch;
    debugLog("Fetch capture installed");

    const fetchWrapper: typeof globalThis.fetch = async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const request = new Request(input, init);
      let requestClone: Request | undefined;

      try {
        requestClone = request.clone();
      } catch (error) {
        debugLog("Fetch request capture clone failed", {
          errorName: error instanceof Error ? error.name : typeof error,
        });
      }

      const context: FetchCaptureContext = {};

      return this.fetchContext.run(context, async () => {
        const response = await originalFetch(request);

        const spanId = context.spanId;

        if (!spanId) {
          debugLog("Fetch capture skipped; no outbound span was associated");
          return response;
        }

        let responseClone: Response | undefined;

        try {
          responseClone = response.clone();
        } catch (error) {
          debugLog("Fetch response capture clone failed", {
            spanId,
            errorName: error instanceof Error ? error.name : typeof error,
          });
        }

        const capture = this.captureFetchDetails(
          spanId,
          requestClone,
          responseClone,
        ).catch((error) => {
          debugLog("Fetch capture failed", {
            spanId,
            errorName: error instanceof Error ? error.name : typeof error,
          });
        });
        this.pendingFetchCaptures.add(capture);
        void capture.then(
          () => this.pendingFetchCaptures.delete(capture),
          () => this.pendingFetchCaptures.delete(capture),
        );

        return response;
      });
    };

    this.fetchWrapper = fetchWrapper;
    globalThis.fetch = fetchWrapper;
  }

  stopFetchCapture(): void {
    if (!this.originalFetch) {
      return;
    }

    if (globalThis.fetch === this.fetchWrapper) {
      globalThis.fetch = this.originalFetch;
    }

    this.originalFetch = undefined;
    this.fetchWrapper = undefined;
  }

  async waitForPendingFetchCaptures(): Promise<void> {
    while (this.pendingFetchCaptures.size > 0) {
      await Promise.allSettled([...this.pendingFetchCaptures]);
    }
  }

  associateFetchSpan(spanId: string): void {
    const context = this.fetchContext.getStore();

    if (!context) {
      debugLog("Fetch span association skipped; no active fetch context", { spanId });
      return;
    }

    context.spanId = spanId;
    debugLog("Fetch span associated", { spanId });
  }

  private async captureFetchRequest(
    spanId: string,
    request: Request,
  ): Promise<void> {
    const requestHeaders = this.redactHeaders(this.normalizeFetchHeaders(
      request.headers,
    ));

    let requestBody: unknown;

    try {
      this.storage.updateHttpClientDetails(spanId, {
        requestHeaders,
      });
    } catch (error) {
      debugLog("Fetch request capture failed", {
        spanId,
        errorName: error instanceof Error ? error.name : typeof error,
      });
    }

    if (!request.body) {
      debugLog("Fetch request details captured", { spanId });
      return;
    }

    try {
      const body = await this.readFetchBody(request.body);

      if (body === undefined) {
        return;
      }

      requestBody = this.parseBody(
        body,
        request.headers.get("content-type"),
      );
      this.storage.updateHttpClientDetails(spanId, { requestBody });
    } catch (error) {
      debugLog("Fetch request body capture failed", {
        spanId,
        errorName: error instanceof Error ? error.name : typeof error,
      });
    }
    debugLog("Fetch request details captured", { spanId });
  }

  private async captureFetchResponse(
    spanId: string,
    response: Response,
  ): Promise<void> {
    const responseHeaders = this.redactHeaders(this.normalizeFetchHeaders(
      response.headers,
    ));

    let responseBody: unknown;

    try {
      this.storage.updateHttpClientDetails(spanId, {
        responseHeaders,
      });
    } catch (error) {
      debugLog("Fetch response capture failed", {
        spanId,
        errorName: error instanceof Error ? error.name : typeof error,
      });
    }

    if (!response.body) {
      debugLog("Fetch response details captured", {
        spanId,
        statusCode: response.status,
      });
      return;
    }

    try {
      const body = await this.readFetchBody(response.body);

      if (body === undefined) {
        return;
      }

      responseBody = this.parseBody(
        body,
        response.headers.get("content-type"),
      );
      this.storage.updateHttpClientDetails(spanId, { responseBody });
    } catch (error) {
      debugLog("Fetch response body capture failed", {
        spanId,
        errorName: error instanceof Error ? error.name : typeof error,
      });
    }
    debugLog("Fetch response details captured", {
      spanId,
      statusCode: response.status,
    });
  }

  private async captureFetchDetails(
    spanId: string,
    request: Request | undefined,
    response: Response | undefined,
  ): Promise<void> {
    if (request) {
      await this.captureFetchRequest(spanId, request);
    }

    if (response) {
      await this.captureFetchResponse(spanId, response);
    }
  }

  private async readFetchBody(
    body: ReadableStream<Uint8Array>,
  ): Promise<Buffer | undefined> {
    const reader = body.getReader();
    const chunks: Buffer[] = [];
    let bytes = 0;

    try {
      while (true) {
        const result = await reader.read();

        if (result.done) {
          return Buffer.concat(chunks, bytes);
        }

        const chunk = Buffer.from(result.value);
        bytes += chunk.length;

        if (bytes > Config.NATIVE_HTTP_BODY_LIMIT_BYTES) {
          chunks.length = 0;
          void reader.cancel().catch(() => undefined);
          return undefined;
        }

        chunks.push(chunk);
      }
    } finally {
      reader.releaseLock();
    }
  }

  private normalizeFetchHeaders(
    headers: Headers,
  ): Record<string, string | string[]> {
    const result: Record<string, string | string[]> = {};

    headers.forEach((value, key) => {
      result[key] = value;
    });

    return result;
  }

  private redactHeaders(
    headers: Record<string, string | string[]>,
  ): Record<string, string | string[]> {
    return this.redactionService.redactData(headers) as Record<
      string,
      string | string[]
    >;
  }
}
