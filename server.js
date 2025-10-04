// server.js (ESM, with /api/metadata and /api/markSoldOut)
import express from "express";
import next from "next";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const port = process.env.PORT || 3000;
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

app.prepare().then(() => {
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

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
