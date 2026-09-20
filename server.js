// Render / Node entrypoint: serves public/ and wraps the existing Netlify
// function handlers so the frontend can keep calling /.netlify/functions/*.

require("dotenv").config();

const path = require("path");
const express = require("express");

const stats = require("./netlify/functions/stats");
const overview = require("./netlify/functions/overview");
const links = require("./netlify/functions/links");

const app = express();
const PORT = process.env.PORT || 3000;

async function invoke(handler, req, res) {
  try {
    const event = {
      httpMethod: req.method,
      path: req.path,
      rawUrl: req.originalUrl,
      queryStringParameters: req.query || {},
      headers: req.headers,
      body: null,
    };
    const result = await handler(event);
    const status = result.statusCode || 200;
    const headers = result.headers || {};
    Object.keys(headers).forEach((key) => res.set(key, headers[key]));
    if (!headers["Content-Type"] && !headers["content-type"]) {
      res.type("json");
    }
    res.status(status).send(result.body);
  } catch (err) {
    res.status(500).json({ error: err.message || "Internal server error" });
  }
}

function mount(name, handler) {
  const run = (req, res) => invoke(handler, req, res);
  app.get("/.netlify/functions/" + name, run);
  app.get("/api/" + name, run);
}

mount("stats", stats.handler);
mount("overview", overview.handler);
mount("links", links.handler);

app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use(express.static(path.join(__dirname, "public"), { etag: true, maxAge: "5m" }));

app.use((req, res) => {
  if (req.method === "GET" && !req.path.startsWith("/api") && !req.path.startsWith("/.netlify")) {
    return res.sendFile(path.join(__dirname, "public", "index.html"));
  }
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log("TrackingBoard listening on http://localhost:" + PORT);
});
