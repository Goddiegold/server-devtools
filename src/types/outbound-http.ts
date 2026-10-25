export interface FetchCaptureContext {
  spanId?: string;
}

export interface NativeBodyCaptureState {
  chunks: Buffer[];
  bytes: number;
  oversized: boolean;
}
