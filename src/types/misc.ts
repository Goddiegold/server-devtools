
export interface IDevToolsRequest {
    method: string;
    path: string;
    route?: string;

    headers: Record<string, string | string[]>;
    query: Record<string, string | string[]>;
    params: Record<string, string>;

    body?: unknown;
}

export interface IServerDevlToolsParams {
    encryption?: {
        key: string,
        fields?: string[]
    },
    auth: {
        password: string,
        username: string
    }
}