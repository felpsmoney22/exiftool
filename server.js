// Escrever metadados (tags no body: { Title, Keywords, ... })
app.post("/write", upload.single("file"), async (req, res) => {
  // tenta preservar extensão do arquivo original
  const extFromName = req.file?.originalname ? path.extname(req.file.originalname) : "";
  const ext =
    extFromName ||
    (req.file?.mimetype?.includes("png") ? ".png" :
     req.file?.mimetype?.includes("jpeg") ? ".jpg" :
     req.file?.mimetype?.includes("heic") ? ".heic" :
     req.file?.mimetype?.includes("quicktime") || req.file?.mimetype?.includes("mp4") ? ".mov" :
     ""); // melhor do que nada

  const outPath = path.join(os.tmpdir(), `${req.file.filename}_out${ext}`);

  try {
    // Suporta quando 'tags' vem como string (multipart) ou objeto
    const writeTags =
      typeof req.body?.tags === "string"
        ? JSON.parse(req.body.tags || "{}")
        : (req.body?.tags || req.body || {});

    // 1) Tenta escrever para CÓPIA (-o=outPath)
    await exiftool.write(req.file.path, writeTags, [`-o=${outPath}`]);

    // 2) Confirma se a cópia foi criada; se não, faz fallback para overwrite no original
    try {
      await fs.access(outPath);
    } catch {
      await exiftool.write(req.file.path, writeTags, ["-overwrite_original"]);
    }

    // Decide qual arquivo enviar
    const resultPath = (await fileExists(outPath)) ? outPath : req.file.path;
    const bin = await fs.readFile(resultPath);

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", 'attachment; filename="edited' + (ext || "") + '"');
    res.send(bin);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  } finally {
    // limpeza
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    await fs.unlink(outPath).catch(() => {});
  }
});

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}
