// routes/metadata.js
const fs = require("fs");
const path = require("path");
const express = require("express");

const router = express.Router();
const METADATA_DIR = path.join(__dirname, "../metadata");

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
        result[category].push({ fileName, metadata: content });
      }
    }

    res.json(result);
  } catch (err) {
    console.error("Error loading metadata:", err);
    res.status(500).json({ error: "Failed to load metadata" });
  }
});

module.exports = router;
