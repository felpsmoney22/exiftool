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
app.post("/write", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "file field is required" });

  // tenta preservar extensão
  const extFromName = req.file?.originalname ? path.extname(req.file.originalname) : "";
  const ext =
    extFromName ||
    (req.file?.mimetype?.includes("png") ? ".png" :
     req.file?.mimetype?.includes("jpeg") ? ".jpg" :
     req.file?.mimetype?.includes("heic") ? ".heic" :
     req.file?.mimetype?.includes("mp4") || req.file?.mimetype?.includes("quicktime") ? ".mov" :
     "");

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

    // 1) Tenta escrever para cópia
    await exiftool.write(req.file.path, writeTags, [`-o=${outPath}`]);

    // 2) Se a cópia não existir, sobrescreve o original
    if (!(await fileExists(outPath))) {
      await exiftool.write(req.file.path, writeTags, ["-overwrite_original"]);
    }

    const resultPath = (await fileExists(outPath)) ? outPath : req.file.path;
    const bin = await fs.readFile(resultPath);

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="edited${ext || ""}"`);
    res.send(bin);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  } finally {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    await fs.unlink(outPath).catch(() => {});
  }
});

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`exiftool-rest listening on :${port}`));

// encerra exiftool ao sair
process.on("SIGTERM", () => exiftool.end().finally(() => process.exit(0)));
process.on("SIGINT", () => exiftool.end().finally(() => process.exit(0)));
