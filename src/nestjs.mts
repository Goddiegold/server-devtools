import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { default: ServerDevToolsNestInterceptor } = require(
  "./integrations/nestjs/server-devtools-nest.interceptor.js",
);

export { ServerDevToolsNestInterceptor };
