
// examples/nestjs/server-devtools.ts

import ServerDevTools from "../../src";

export const serverDevTools = new ServerDevTools({
  auth: {
    username: "admin",
    password: "12345678",
  },
});

serverDevTools.start().then(r=>{
console.log("Started Server Devtools")
}).catch(e=>{

});