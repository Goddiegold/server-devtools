
export interface IHttpClientDetails {
  spanId: string;
  requestHeaders?: Record<string, string | string[]>;
  requestBody?: unknown;
  responseHeaders?: Record<string, string | string[]>;
  responseBody?: unknown;
}