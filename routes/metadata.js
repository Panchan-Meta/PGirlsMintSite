// routes/metadata.js
const fs = require("fs");
const path = require("path");
const express = require("express");

const router = express.Router();

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
    console.error("Error loading metadata:", err);
    res.status(500).json({ error: "Failed to load metadata" });
  }
});


