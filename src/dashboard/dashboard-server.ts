import { IncomingMessage, ServerResponse } from "node:http";
import Config from "../config";
import TraceStore from "../core/trace-store";
import DashboardRequestMapper from './dashboard-request-mapper';


export default class DashboardServer {
    private readonly requestMapper = new DashboardRequestMapper();
    // private server?: Server;


    constructor(
        private readonly traceStore: TraceStore,
    ) {
    }

    handle(req: IncomingMessage,
        res: ServerResponse,) {
        if (
            req.method === Config.REQUEST_METHOD.GET &&
            req.url === Config.DASHBOARD_API_ROUTES.TRACES) {
            // res.writeHead(200, { 'Content-Type': 'application/json' });

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(this.traceStore.getAll()));
            return;
        }


        if (
            req.method === Config.REQUEST_METHOD.GET &&
            req.url === Config.DASHBOARD_API_ROUTES.REQUESTS) {
            const requests = this.traceStore.getAll().map(trace => this.requestMapper.map(trace));

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(requests))
            return;
        }


        res.statusCode = 404;
        res.end("Not Found");
    }


    // start(port: number): Promise<void> {
    //     return new Promise((resolve, reject) => {
    //         this.server = createServer((req, res) => {
    //             this.handle(req, res);
    //         });

    //         this.server.once("error", reject);

    //         this.server.listen(port, () => {
    //             this.server?.removeListener("error", reject);
    //             resolve();
    //         });
    //     });
    // }

    // stop(): Promise<void> {
    //     return new Promise((resolve, reject) => {
    //         if (!this.server) {
    //             resolve();
    //             return;
    //         }

    //         this.server.close((error) => {
    //             if (error) {
    //                 reject(error);
    //                 return;
    //             }

    //             this.server = undefined;
    //             resolve();
    //         });
    //     });
    // }

}