import express from "express";
import multer from "multer";
import { exiftool } from "exiftool-vendored";
import fs from "fs/promises";
import path from "path";
import os from "os";

const app = express();
app.use(express.json({ limit: "50mb" }));

// upload para temp
const upload = multer({ dest: os.tmpdir() });

// Ler metadados (imagem ou vídeo)
app.post("/read", upload.single("file"), async (req, res) => {
  try {
    const tags = await exiftool.read(req.file.path);
    res.json({ ok: true, tags });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  } finally {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
  }
});

// Escrever metadados (tags no body: { Title, Keywords, ... })
app.post("/write", upload.single("file"), async (req, res) => {
  const outPath = path.join(os.tmpdir(), `${req.file.filename}_out`);
  try {
    // ex.: { "Title": "Meu Título", "XPKeywords": "tag1;tag2" }
    const writeTags = req.body && typeof req.body === "object" ? req.body : JSON.parse(req.body.tags || "{}");
    await exiftool.write(req.file.path, writeTags, ["-overwrite_original", `-o${outPath}`]); // grava em cópia
    const bin = await fs.readFile(outPath);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", "attachment; filename=\"edited\"");
    res.send(bin);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  } finally {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    await fs.unlink(outPath).catch(() => {});
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`exiftool-rest on :${port}`));
