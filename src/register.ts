import ServerDevTools from ".";


const serverDevTools = new ServerDevTools({
    auth: {
        username: process.env.SERVER_DEVTOOLS_USERNAME ?? "",
        password: process.env.SERVER_DEVTOOLS_PASSWORD ?? "",
    },
});

serverDevTools.start();

const shutdown = async () => {
    await serverDevTools.shutdown();
};


process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
