import { IDevToolsError } from "./dashboard";

export interface IDatabaseOperation {
  spanId: string;
  system?: string;
  operation?: string;
  database?: string;
  collection?: string;
  query?: string;
  durationMs: number;
  status: {
    code: number;
    message?: string;
  };
  error?: IDevToolsError;
}