import { IncomingMessage } from "node:http";

export interface IDevToolsRequest {
    method: string;
    path: string;
    route?: string;

    headers: Record<string, string | string[]>;
    query: Record<string, string | string[]>;
    params: Record<string, string>;

    body?: unknown;
}


export interface IDevToolsCurrentUser {
    [key: string]: unknown;
}

export interface IServerDevlToolsParams {
    encryption?: {
        key: string,
        fields?: string[]
    },
    auth: {
        password: string,
        username: string
    },
    getCurrentUser?: (
        req: IncomingMessage,
    ) => IDevToolsCurrentUser | undefined;
}