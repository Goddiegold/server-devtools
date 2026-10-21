import ServerDevTools from "../../src";

export const serverDevTools = new ServerDevTools({
  auth: {
    username: "admin",
    password: "password",
  },
});

serverDevTools.start().then(() => {
  console.log("ServerDevTools started");
}).catch((error) => {
  console.error("ServerDevTools failed to start", error);
  process.exitCode = 1;
});
