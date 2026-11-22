import "dotenv/config";

import ServerDevTools from "server-devtools";

const encryptionKey =
  process.env.SERVER_DEVTOOLS_ENCRYPTION_KEY
  ?? "K2I3QiRWSThQR2JWUHNbRXAmRXcuJChteVBCMDhCRTE=";

export const devtools = new ServerDevTools({
  auth: {
    username: "admin",
    password: "12345678",
  },
  encryption: {
    key: encryptionKey,
  },
  getCurrentUser: (req) => {
    const user = req.user;
    return user && typeof user === "object" ? user : undefined;
  },
});

globalThis.__serverDevtools = devtools;

await devtools.start();

console.log("Started ServerDevTools successfully");