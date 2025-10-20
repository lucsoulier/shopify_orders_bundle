// hello.js
import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Test O2switch</title></head>
      <body style="font-family: Arial; text-align: center; padding: 50px;">
        <h1>✅ Ça fonctionne !</h1>
        <p>Node.js tourne correctement sur O2switch</p>
        <p>Port: ${port}</p>
        <p>HOST: ${process.env.HOST || 'non défini'}</p>
        <p>NODE_ENV: ${process.env.NODE_ENV || 'non défini'}</p>
      </body>
    </html>
  `);
});

app.get('/test', (req, res) => {
  res.json({
    status: 'OK',
    port: port,
    env: {
      HOST: process.env.HOST,
      NODE_ENV: process.env.NODE_ENV,
      SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL
    }
  });
});

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});