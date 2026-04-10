const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "0.0.0.0";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function getNetworkUrls() {
  const urls = [];
  const interfaces = os.networkInterfaces();

  for (const addresses of Object.values(interfaces)) {
    if (!addresses) {
      continue;
    }

    for (const address of addresses) {
      if (address.family === "IPv4" && !address.internal) {
        urls.push(`http://${address.address}:${port}/`);
      }
    }
  }

  return urls;
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${host}:${port}`);
    const requestedPath = requestUrl.pathname === "/" ? "/index.html" : decodeURIComponent(requestUrl.pathname);
    const filePath = path.resolve(root, `.${requestedPath}`);

    if (!filePath.startsWith(root + path.sep)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Förbjudet");
      return;
    }

    const stat = await fsp.stat(filePath);

    if (!stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Hittades inte");
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream"
    });

    fs.createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Hittades inte");
  }
});

server.listen(port, host, () => {
  const browserHost = host === "0.0.0.0" ? "localhost" : host;
  const networkUrls = host === "0.0.0.0" ? getNetworkUrls() : [];

  console.log(`Magnetjakten körs på http://${browserHost}:${port}/`);

  for (const url of networkUrls) {
    console.log(`På nätverket: ${url}`);
  }
});
