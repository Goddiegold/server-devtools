// import { Instrumentation } from "./instumentations/instrumentation";

import { IncomingMessage, ServerResponse } from "node:http";
import DashboardServer from "./dashboard/dashboard-server";
import { Instrumentation } from "./instrumentation/instrumentation";


class ServerDevTools {
    private instrumentation: Instrumentation;
        private dashboard: DashboardServer;

    constructor() {
        this.instrumentation = new Instrumentation();
        this.dashboard = new DashboardServer(this.instrumentation.traceStore);
    }

    async start(){
        await this.instrumentation.start();
        // await this.dashboard.start(3001);
    }

     handle(req: IncomingMessage, res: ServerResponse) {
        return this.dashboard.handle(req, res);
    }
    
    async shutdown(){
        // await this.dashboard.stop();
        await this.instrumentation.shutdown();
    }

}


export default ServerDevTools;