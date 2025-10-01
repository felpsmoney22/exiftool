import express from "express";
import multer from "multer";
import { exiftool } from "exiftool-vendored";
import fs from "fs/promises";
import path from "path";
import os from "os";

const app = express();
app.use(express.json({ limit: "50mb" }));

// Upload para /tmp
const upload = multer({ dest: os.tmpdir() });

// --- helpers -------------------------------------------------------

function guessExt({ originalname = "", mimetype = "" } = {}) {
  const extFromName = originalname ? path.extname(originalname) : "";
  if (extFromName) return extFromName;

  if (/png/i.test(mimetype)) return ".png";
  if (/jpe?g/i.test(mimetype)) return ".jpg";
  if (/heic|heif/i.test(mimetype)) return ".heic";
  if (/mp4/i.test(mimetype)) return ".mp4";
  if (/quicktime|mov/i.test(mimetype)) return ".mov";
  return "";
}

function guessMime(ext, fallback) {
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".heic") return "image/heic";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  return fallback || "application/octet-stream";
}

function safeFileName(name, ext) {
  const base = (name || "file").replace(/[^\w.\-]+/g, "_");
  // garante que tem extensão
  if (ext && !base.toLowerCase().endsWith(ext.toLowerCase())) return base + ext;
  return base;
}

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

// --- rotas ---------------------------------------------------------

// Healthcheck simples
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "exiftool-rest" });
});

// Ler metadados
app.post("/read", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "file field is required" });
  try {
    const tags = await exiftool.read(req.file.path);
    res.json({ ok: true, tags });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  } finally {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
  }
});

// Escrever metadados (tags no body: JSON ou string JSON)
// Aceita opcional: filename (string) e options (array JSON) para flags extras do exiftool
app.post("/write", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "file field is required" });

  // extensão e mime do ARQUIVO DE ENTRADA
  const ext = guessExt(req.file);
  const inMime = guessMime(ext, req.file.mimetype);

  // nome desejado de SAÍDA (padrão: mesmo nome + _edited)
  const baseIn = req.file.originalname ? path.parse(req.file.originalname).name : "file";
  const requestedName = typeof req.body?.filename === "string" && req.body.filename.trim()
    ? req.body.filename.trim()
    : `${baseIn}_edited${ext || ""}`;
  const outName = safeFileName(requestedName, ext);

  const outPath = path.join(os.tmpdir(), `${req.file.filename}_out${ext}`);

  try {
    // tags pode vir como string (multipart) ou objeto
    let writeTags = {};
    if (typeof req.body?.tags === "string") {
      try { writeTags = JSON.parse(req.body.tags || "{}"); }
      catch { return res.status(400).json({ ok: false, error: "tags must be JSON or stringified JSON" }); }
    } else {
      writeTags = (req.body?.tags || req.body || {});
    }

    // options (array) para flags extras do exiftool, ex.: ["-all="]
    let extraOpts = [];
    if (typeof req.body?.options === "string") {
      try { extraOpts = JSON.parse(req.body.options || "[]"); }
      catch { return res.status(400).json({ ok: false, error: "options must be JSON array or stringified array" }); }
    } else if (Array.isArray(req.body?.options)) {
      extraOpts = req.body.options;
    }

    // 1) Tenta escrever para CÓPIA (-o=outPath) com quaisquer opções extras
    await exiftool.write(req.file.path, writeTags, [...extraOpts, `-o=${outPath}`]);

    // 2) Se a cópia não existir, sobrescreve o original (fallback)
    if (!(await fileExists(outPath))) {
      await exiftool.write(req.file.path, writeTags, [...extraOpts, "-overwrite_original"]);
    }

    const resultPath = (await fileExists(outPath)) ? outPath : req.file.path;
    const bin = await fs.readFile(resultPath);

    const mime = inMime || "application/octet-stream";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `attachment; filename="${outName}"`);
    res.send(bin);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  } finally {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    await fs.unlink(outPath).catch(() => {});
  }
});

// --- startup/shutdown ----------------------------------------------

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`exiftool-rest listening on :${port}`));

process.on("SIGTERM", () => exiftool.end().finally(() => process.exit(0)));
process.on("SIGINT", () => exiftool.end().finally(() => process.exit(0)));
