// server.js
import { serve } from "@react-router/serve";

const port = process.env.PORT || 3000;

console.log(`🚀 Starting server on port ${port}`);
console.log(`🌍 URL: ${process.env.SHOPIFY_APP_URL || 'http://localhost:' + port}`);

serve({
  build: await import("./build/server/index.js"),
  port: port,
  mode: process.env.NODE_ENV || "production"
});