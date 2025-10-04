// routes/metadata.js
const fs = require("fs");
const path = require("path");
const express = require("express");

const router = express.Router();
const METADATA_DIR = path.join(__dirname, "../metadata");
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

router.get("/", (req, res) => {
  const result = {};

  try {
    const categories = fs.readdirSync(METADATA_DIR).filter((name) =>
      fs.statSync(path.join(METADATA_DIR, name)).isDirectory()
    );

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
  } catch (err) {
    console.error("Error loading metadata:", err);
    res.status(500).json({ error: "Failed to load metadata" });
  }
});

router.post("/updateListing", (req, res) => {
  try {
    const { category, fileName, mintStatus, price, ownerAddress } =
      req.body || {};
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

    if (typeof ownerAddress === "string") {
      const trimmedOwner = ownerAddress.trim();
      if (trimmedOwner) {
        data.ownerAddress = trimmedOwner;
      }
    }

    const payload = ensureMintStatus(data, filePath);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
    res.json({ ok: true, metadata: payload });
  } catch (err) {
    console.error("Error updating listing:", err);
    res.status(500).json({ error: "Failed to update metadata" });
  }
});

router.post("/markSoldOut", (req, res) => {
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
  } catch (err) {
    console.error("Error marking sold out:", err);
    res.status(500).json({ error: "Failed to update metadata" });
  }
});

module.exports = router;
