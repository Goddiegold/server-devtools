import ServerDevTools from ".";


const serverDevTools = new ServerDevTools();

serverDevTools.start();

const shutdown = async () => {
    await serverDevTools.shutdown();
};


process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);