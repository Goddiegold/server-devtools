import { ClientRequest, IncomingMessage } from "node:http";
import SQLiteStorage from "../../storage/sqlite-storage";
import { AsyncLocalStorage } from "node:async_hooks";
import { debugLog } from "../../utils/logger";
interface FetchCaptureContext {
  spanId?: string;
}
export class OutboundHttpCapture {
  private readonly fetchContext =
    new AsyncLocalStorage<FetchCaptureContext>();

  private originalFetch?: typeof globalThis.fetch;
  private fetchWrapper?: typeof globalThis.fetch;

  constructor(
    private readonly storage: SQLiteStorage,
  ) { }

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
    const headers = this.normalizeHeaders(
      request.getHeaders(),
    );

    this.storage.updateHttpClientDetails(spanId, {
      requestHeaders: headers,
    });
  }

  private captureNativeRequestBody(
    spanId: string,
    request: ClientRequest,
  ): void {
    const chunks: Buffer[] = [];

    const originalWrite = request.write.bind(request);
    const originalEnd = request.end.bind(request);

    request.write = ((chunk: any, ...args: any[]) => {
      if (chunk !== undefined && chunk !== null) {
        chunks.push(Buffer.from(chunk));
      }

      return originalWrite(chunk, ...args);
    }) as typeof request.write;

    request.end = ((chunk?: any, ...args: any[]) => {
      if (chunk !== undefined && chunk !== null) {
        chunks.push(Buffer.from(chunk));
      }

      if (chunks.length > 0) {
        this.storage.updateHttpClientDetails(spanId, {
          requestBody: this.parseBody(
            Buffer.concat(chunks),
            request.getHeader("content-type"),
          ),
        });
      }

      return originalEnd(chunk, ...args);
    }) as typeof request.end;
  }

  private captureNativeResponseHeaders(
    spanId: string,
    response: IncomingMessage,
  ): void {
    const headers = this.normalizeHeaders(
      response.headers,
    );

    this.storage.updateHttpClientDetails(spanId, {
      responseHeaders: headers,
    });
  }

  private captureNativeResponseBody(
    spanId: string,
    response: IncomingMessage,
  ): void {
    const chunks: Buffer[] = [];

    response.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
    });

    response.once("end", () => {
      if (chunks.length === 0) {
        return;
      }

      this.storage.updateHttpClientDetails(spanId, {
        responseBody: this.parseBody(
          Buffer.concat(chunks),
          response.headers["content-type"],
        ),
      });
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
      const requestClone = request.clone();

      const context: FetchCaptureContext = {};

      return this.fetchContext.run(context, async () => {
        const response = await originalFetch(request);

        const spanId = context.spanId;

        if (!spanId) {
          debugLog("Fetch capture skipped; no outbound span was associated");
          return response;
        }

        const responseClone = response.clone();

        await this.captureFetchRequest(spanId, requestClone);
        await this.captureFetchResponse(spanId, responseClone);

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
    const requestHeaders = this.normalizeFetchHeaders(
      request.headers,
    );

    let requestBody: unknown;

    if (request.body) {
      const body = await request.text();

      requestBody = this.parseBody(
        body,
        request.headers.get("content-type"),
      );
    }

    this.storage.updateHttpClientDetails(spanId, {
      requestHeaders,
      requestBody,
    });
    debugLog("Fetch request details captured", { spanId });
  }

  private async captureFetchResponse(
    spanId: string,
    response: Response,
  ): Promise<void> {
    const responseHeaders = this.normalizeFetchHeaders(
      response.headers,
    );

    let responseBody: unknown;

    if (response.body) {
      const body = await response.text();

      responseBody = this.parseBody(
        body,
        response.headers.get("content-type"),
      );
    }

    this.storage.updateHttpClientDetails(spanId, {
      responseHeaders,
      responseBody,
    });
    debugLog("Fetch response details captured", {
      spanId,
      statusCode: response.status,
    });
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
}
