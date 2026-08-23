// import { Instrumentation } from "./instumentations/instrumentation";

import { Instrumentation } from "./instrumentation/instrumentation";


class ServerDevTools {
    private instrumentation: Instrumentation;

    constructor() {
        this.instrumentation = new Instrumentation();
    }

    async start(){
        await this.instrumentation.start();
    }

    async shutdown(){
        await this.instrumentation.shutdown();
    }

}


export default ServerDevTools;