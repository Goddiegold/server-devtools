npx tsx --import ./src/register.ts ./examples/node-http/server.ts

curl http://localhost:3434/hello

npx tsx --import ./src/register.ts ./examples/express/server.ts

 NODE_OPTIONS="--experimental-loader=@opentelemetry/instrumentation/hook.mjs" \
node --import ./dist/src/register.js ./dist/examples/express/server.js

NODE_OPTIONS="--experimental-loader=@opentelemetry/instrumentation/hook.mjs" \
node --import ./dist/src/register.js ./dist/examples/nestjs/main.js

npx ./examples/dashboard/server.ts

curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com"}'

curl -X POST http://localhost:3000/users \               
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com"}'

curl -i -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com"}'
         
curl -X GET  http://localhost:3000/_devtools/api/requests                               

curl http://localhost:3000/_devtools/api/traces/26661409fdd661d5c23d7833e9d60dac/request
curl http://localhost:3000/_devtools/api/traces/8ebaa0da889ab53d39ecf87fa22f2e26/response