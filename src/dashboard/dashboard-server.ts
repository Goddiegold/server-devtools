import { IncomingMessage, ServerResponse } from "node:http";
import Config from "../config";
import TraceStore from "../core/trace-store";
import DashboardRequestMapper from './dashboard-request-mapper';
import ExecutionTreeBuilder from "../core/execution-tree-builder";


export default class DashboardServer {
    private readonly requestMapper = new DashboardRequestMapper();
    private readonly executionTreeBuilder = new ExecutionTreeBuilder();
    // private server?: Server;


    constructor(
        private readonly traceStore: TraceStore,
    ) {
    }

    handle(req: IncomingMessage,
        res: ServerResponse,) {
        const requestUrl = req.url ?? '';
        const pathname = requestUrl.split('?')[0];

        if (req.method === Config.REQUEST_METHOD.GET &&
            req.url?.startsWith(`${Config.DASHBOARD_API_ROUTES.TRACES}/`) &&
            req.url.endsWith("/execution")) {
            const prefix = `${Config.DASHBOARD_API_ROUTES.TRACES}/`;


            const traceId = req.url
                .slice(prefix.length)
                .replace(/\/execution$/, "");


            const trace = this.traceStore.get(traceId);

            if (!trace) {
                res.statusCode = 404;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                    message: "Trace not found",
                }));
                return;
            }

            const executionTree = this.executionTreeBuilder.build(trace);

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(executionTree));
            return;
        }

        if (
            req.method === Config.REQUEST_METHOD.GET &&
            pathname.startsWith(`${Config.DASHBOARD_API_ROUTES.TRACES}/`)
        ) {
            const traceId = decodeURIComponent(pathname.slice(
                `${Config.DASHBOARD_API_ROUTES.TRACES}/`.length
            ));

            const trace = this.traceStore.get(traceId);

            if (!trace) {
                res.statusCode = 404;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                    message: "Trace not found",
                }));
                return;
            }

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(trace));
            return;
        }

        if (
            req.method === Config.REQUEST_METHOD.GET &&
            pathname === Config.DASHBOARD_API_ROUTES.REQUESTS) {
            const requests = this.traceStore.getAll().map(trace => this.requestMapper.map(trace));

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(requests))
            return;
        }


        res.statusCode = 404;
        res.end("Not Found");
    }


}
