npx tsx --import ./src/register.ts ./examples/node-http/server.ts

curl http://localhost:3434/hello

npx tsx --import ./src/register.ts ./examples/express/server.ts

NODE_OPTIONS="--experimental-loader=@opentelemetry/instrumentation/hook.mjs" \
node --import ./dist/src/register.js ./dist/examples/express/server.js

NODE_OPTIONS="--experimental-loader=@opentelemetry/instrumentation/hook.mjs" \
node --import ./dist/src/register.js ./dist/examples/nestjs/main.js

npx tsx ./examples/dashboard/server.ts

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
curl http://localhost:3000//_devtools/api/traces/8c80d2434e70a046f77af66b88e0ee63/errors

curl -i http://localhost:3000/error-test
curl http://localhost:3000/users/123    
SERVER_DEVTOOLS_ENCRYPTION_KEY=<base64-encoded-32-byte-key>
rm server-devtools.db

curl -c cookies.txt \
  -X POST http://localhost:3000/_devtools/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"godwin","password":"12345678"}'


  # 1. Basic NestJS request
curl http://localhost:3000/users/hello

# 2. Error capture
curl http://localhost:3000/users/broken

# 3. MongoDB
curl http://localhost:3000/users/mongo/123

# 4. Outbound fetch
curl http://localhost:3000/users/fetch

# 5. MongoDB + outbound fetch
curl http://localhost:3000/users/combined/123

npx tsx --import ./src/register.ts examples/nestjs/main.ts

curl http://localhost:3000/users/hello
curl http://localhost:3000/users/mongo/123
curl http://localhost:3000/users/fetch
curl http://localhost:3000/users/combined/123
curl http://localhost:3000/users/broken