// server.js (ESM, with /api/metadata and /api/markSoldOut)
import express from "express";
import next from "next";
import fs from "fs";
import path from "path";
import net from "net";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const requestedPort = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const METADATA_DIR = path.join(__dirname, "metadata");
const DEFAULT_MINT_STATUS = "BeforeList";

function ensureMintStatus(data, filePath) {
  if (!data.mintStatus) {
    data.mintStatus = DEFAULT_MINT_STATUS;
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to persist default mintStatus", err);
    }
  }
  return data;
}

app.prepare().then(async () => {
  const server = express();
  server.use(express.json());

  // === GET /api/metadata ===
  server.get("/api/metadata", (req, res) => {
    try {
      const result = {};
      const categories = fs
        .readdirSync(METADATA_DIR)
        .filter((name) => fs.statSync(path.join(METADATA_DIR, name)).isDirectory());

      for (const category of categories) {
        const categoryPath = path.join(METADATA_DIR, category);
        const files = fs.readdirSync(categoryPath).filter((f) => f.endsWith(".json"));
        result[category] = [];
        for (const fileName of files) {
          const filePath = path.join(categoryPath, fileName);
          const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
          result[category].push({
            fileName,
            metadata: ensureMintStatus(content, filePath),
          });
        }
      }
      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to load metadata" });
    }
  });

  // === POST /api/updateListing ===
  // body: { category: string, fileName: string, mintStatus?: string, price?: string }
  server.post("/api/updateListing", (req, res) => {
    try {
      const {
        category,
        fileName,
        mintStatus,
        price,
        ownerAddress,
      } = req.body || {};
      if (!category || !fileName) {
        res.status(400).json({ error: "category and fileName are required" });
        return;
      }
      const filePath = path.join(METADATA_DIR, category, fileName);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: "metadata file not found" });
        return;
      }
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

      if (typeof mintStatus === "string" && mintStatus.trim()) {
        data.mintStatus = mintStatus.trim();
      } else if (!data.mintStatus) {
        data.mintStatus = DEFAULT_MINT_STATUS;
      }

      if (typeof price !== "undefined") {
        const trimmed = typeof price === "string" ? price.trim() : "";
        if (trimmed) {
          data.price = trimmed;
        } else {
          delete data.price;
        }
      }

      if (typeof ownerAddress !== "undefined") {
        const trimmedOwner =
          typeof ownerAddress === "string" ? ownerAddress.trim() : "";
        if (trimmedOwner) {
          data.ownerAddress = trimmedOwner;
          data.owner = trimmedOwner;
          data.walletAddress = trimmedOwner;
        } else {
          delete data.ownerAddress;
          delete data.owner;
          delete data.walletAddress;
        }
      }


      const payload = ensureMintStatus(data, filePath);
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
      res.json({ ok: true, metadata: payload });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to update metadata" });
    }
  });

  // Backwards compatibility: markSoldOut keeps updating soldout flag and resets listing state
  server.post("/api/markSoldOut", (req, res) => {
    try {
      const { category, fileName } = req.body || {};
      if (!category || !fileName) {
        res.status(400).json({ error: "category and fileName are required" });
        return;
      }
      const filePath = path.join(METADATA_DIR, category, fileName);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: "metadata file not found" });
        return;
      }
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      data.soldout = true;
      data.mintStatus = DEFAULT_MINT_STATUS;
      delete data.price;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to update metadata" });
    }
  });

  // Next.js ルーティング
  server.all("/*", (req, res) => handle(req, res));

  const startServerWithFallback = async (startPort) => {
    let port = startPort;
    // Cap retries to prevent infinite loops if ports are continuously occupied.
    const maxAttempts = 20;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        await new Promise((resolve, reject) => {
          const onError = (error) => {
            server.off("listening", onListening);
            reject(error);
          };

          const onListening = () => {
            server.off("error", onError);
            resolve();
          };

          server.once("error", onError);
          server.once("listening", onListening);
          server.listen(port, host);
        });
        return port;
      } catch (error) {
        if (error.code !== "EADDRINUSE") {
          throw error;
        }

        console.warn(
          `Port ${port} is in use. Attempting to listen on port ${port + 1}.`
        );
        port += 1;
      }
    }

    throw new Error(
      `Unable to find an available port after ${maxAttempts} attempts starting from ${startPort}.`
    );
  };

  try {
    const port = await startServerWithFallback(requestedPort);
    console.log(`> Ready on http://${host}:${port}`);
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
});
