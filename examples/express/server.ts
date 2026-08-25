// examples/express/server.ts

import express from 'express';

const app = express();

app.get('/users/:id', async (req, res) => {
  await fetch('https://example.com');

  res.json({
    id: req.params.id,
  });
});

app.listen(3434, () => {
  console.log('Express example running at http://localhost:3434');
});