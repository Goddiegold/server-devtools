// examples/node-http/server.ts

import http from 'node:http';

const server = http.createServer(async (req, res) => {
  if (req.url === '/hello') {
    const response = await fetch('https://example.com');

    await response.text();

    res.statusCode = 200;
    res.end('hello');

    return;
  }

  res.statusCode = 404;
  res.end('not found');
});

server.listen(3434, () => {
  console.log('Example server running at http://localhost:3434');
});