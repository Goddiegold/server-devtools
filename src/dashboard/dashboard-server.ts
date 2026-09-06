import { IncomingMessage, ServerResponse } from "node:http";
import Config from "../config";
import TraceStore from "../core/trace-store";
import DashboardRequestMapper from './dashboard-request-mapper';


export default class DashboardServer {
    private readonly requestMapper = new DashboardRequestMapper();


    constructor(
        private readonly traceStore: TraceStore,
        // private readonly requestMapper: DashboardRequestMapper
    ) {
    }

    handle(req: IncomingMessage,
        res: ServerResponse,) {
        if (
            req.method === Config.REQUEST_METHOD.GET &&
            req.url === Config.DASHBOARD_API_ROUTES.TRACES) {
            // res.writeHead(200, { 'Content-Type': 'application/json' });
            res.status = 200
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(this.traceStore.getAll()));
            return;
        }


        if (
            req.method === Config.REQUEST_METHOD.GET &&
            req.url === Config.DASHBOARD_API_ROUTES.REQUESTS) {
            const requests = this.traceStore.getAll().map(trace => this.requestMapper.map(trace));
            res.status = 200
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(requests))
            return;
        }
    }


}