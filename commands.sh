npx tsx --import ./src/register.ts ./examples/node-http/server.ts

curl http://localhost:3434/hello

npx tsx --import ./src/register.ts ./examples/express/server.ts

 NODE_OPTIONS="--experimental-loader=@opentelemetry/instrumentation/hook.mjs" \
node --import ./dist/src/register.js ./dist/examples/express/server.js

NODE_OPTIONS="--experimental-loader=@opentelemetry/instrumentation/hook.mjs" \
node --import ./dist/src/register.js ./dist/examples/nestjs/main.js