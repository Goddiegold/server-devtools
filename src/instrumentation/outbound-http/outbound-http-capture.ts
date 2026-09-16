import { ClientRequest, IncomingMessage } from "node:http";
import SQLiteStorage from "../../storage/sqlite-storage";

export class OutboundHttpCapture {
  constructor(
    private readonly storage: SQLiteStorage,
  ) {}

  trackNativeRequest(
    spanId: string,
    request: ClientRequest,
  ): void {
    this.captureNativeRequestHeaders(spanId, request);
    this.captureNativeRequestBody(spanId, request);
  }

  trackNativeResponse(
    spanId: string,
    response: IncomingMessage,
  ): void {
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
    body: Buffer,
    contentType: string | string[] | number | undefined,
  ): unknown {
    const rawBody = body.toString("utf8");

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
}