const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const multer = require('multer');
// Note: @lmstudio/sdk is ESM; use dynamic import in Node CommonJS


const app = express();
const PORT = Number(80);

// Paths
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const INDEX_FILE = path.join(DATA_DIR, 'index.json');

// Ensure data directories exist
for (const p of [DATA_DIR, UPLOADS_DIR]) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// Simple in-process write queue for index.json
let writeQueue = Promise.resolve();
async function readIndex() {
  try {
    const raw = await fsp.readFile(INDEX_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [];
    // Normalize missing fields for backward compatibility
    return list.map((e) => {
      if (!e || typeof e !== 'object') return e;
      return {
        id: e.id,
        name: e.name,
        size: e.size,
        createdAt: e.createdAt,
        lastOpenedAt: e.lastOpenedAt || e.createdAt || new Date(0).toISOString(),
        openCount: typeof e.openCount === 'number' ? e.openCount : 0
      };
    });
  } catch (e) {
    return [];
  }
}

function atomicWrite(filePath, contents) {
  const tmp = filePath + '.tmp';
  return fsp.writeFile(tmp, contents, 'utf8').then(() => fsp.rename(tmp, filePath));
}

function queueWriteIndex(updater) {
  writeQueue = writeQueue.then(async () => {
    const list = await readIndex();
    const updated = await updater(list);
    await atomicWrite(INDEX_FILE, JSON.stringify(updated, null, 2));
  }).catch((e) => {
    console.error('index write failed', e);
  });
  return writeQueue;
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Static: ONLY serve public/
app.use(express.static(PUBLIC_DIR, { fallthrough: true }));

// Upload handling
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB cap for now
});

// -----------------------
// LM Studio - Chat Bridge
// -----------------------
let __lm_client = null;
let __lm_model = null;
async function getLMModel() {
  if (__lm_model) return __lm_model;
  // Dynamic import to avoid ESM/CJS interop issues at load time
  const { LMStudioClient } = await import('@lmstudio/sdk');

  const baseUrl = process.env.LMS_BASE_URL && String(process.env.LMS_BASE_URL).trim();
  __lm_client = new LMStudioClient(baseUrl ? { baseUrl } : undefined);

  const modelId = (process.env.LMS_MODEL && String(process.env.LMS_MODEL).trim()) || 'google/gemma-3n-e4b';
  __lm_model = await __lm_client.llm.model(modelId);
  return __lm_model;
}

// Simple helper to validate inbound message
function validateMessageBody(body) {
  const msg = body && typeof body.message === 'string' ? body.message : '';
  const trimmed = (msg || '').trim();
  if (!trimmed) return { ok: false, reason: 'message_required' };
  if (trimmed.length > 8000) return { ok: false, reason: 'message_too_long' };
  return { ok: true, message: trimmed };
}

// Non-streamed chat: returns JSON { text }
app.post('/api/v1/chat', async (req, res, next) => {
  try {
    // Support optional streaming via query param `?stream=1`
    const doStream = String(req.query.stream || '').toLowerCase() === '1';

    const v = validateMessageBody(req.body);
    if (!v.ok) return res.status(400).json({ error: 'bad_request', reason: v.reason });

    const model = await getLMModel();
    // Try to gather model identifiers for headers
    const modelIdForHdr = (process.env.LMS_MODEL && String(process.env.LMS_MODEL).trim()) || 'google/gemma-3n-e4b';
    let modelNameForHdr = '';
    try {
      if (typeof model.getModelInfo === 'function') {
        const info = await model.getModelInfo();
        modelNameForHdr = info && (info.displayName || info.name || '');
      }
    } catch (e) {}

    // Build optional chat context from provided history (last few messages)
    const history = Array.isArray(req.body && req.body.history) ? req.body.history : [];
    const normalizedHistory = [];
    for (const m of history) {
      if (!m || typeof m !== 'object') continue;
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      const content = typeof m.content === 'string' ? m.content : '';
      if (!content) continue;
      normalizedHistory.push({ role, content });
    }
    // Append current message as latest user turn
    const messages = normalizedHistory.concat([{ role: 'user', content: v.message }]);

    // Build chat context object if available
    let chatContext = null;
    try {
      const mod = await import('@lmstudio/sdk');
      if (mod && mod.Chat && typeof mod.Chat.from === 'function') {
        chatContext = mod.Chat.from(messages);
      }
    } catch (e) {
      // Fallback: allow model.respond to accept array or string
    }

    if (doStream) {
      res.status(200);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      if (modelIdForHdr) res.setHeader('X-Model-Id', modelIdForHdr);
      if (modelNameForHdr) res.setHeader('X-Model-Name', modelNameForHdr);
      // Let Node handle chunked transfer automatically
      const prediction = chatContext ? model.respond(chatContext) : model.respond(v.message);
      try {
        for await (const frag of prediction) {
          const piece = (frag && typeof frag.content === 'string') ? frag.content : '';
          if (piece) res.write(piece);
        }
      } catch (e) {
        // if streaming fails mid-way, end the response; client should handle partials
      } finally {
        try { await prediction.result().catch(() => {}); } catch (e) {}
        res.end();
      }
      return;
    }

    // Non-streamed: get the full content
    const result = await (chatContext ? model.respond(chatContext) : model.respond(v.message));
    const text = result && typeof result.content === 'string' ? result.content : '';
    const displayName = result && result.modelInfo && (result.modelInfo.displayName || result.modelInfo.name);
    return res.json({ text, modelId: modelIdForHdr, modelDisplayName: displayName || modelNameForHdr || modelIdForHdr });
  } catch (e) {
    console.error('chat failed', e);
    return res.status(502).json({ error: 'upstream_error', message: e && e.message ? String(e.message) : 'failed' });
  }
});

// Expose model info for client labeling
app.get('/api/v1/chat/model', async (req, res) => {
  try {
    const model = await getLMModel();
    const modelId = (process.env.LMS_MODEL && String(process.env.LMS_MODEL).trim()) || 'google/gemma-3n-e4b';
    let displayName = '';
    try {
      if (typeof model.getModelInfo === 'function') {
        const info = await model.getModelInfo();
        displayName = info && (info.displayName || info.name || '');
      }
    } catch (e) {}
    res.json({ id: modelId, displayName: displayName || modelId });
  } catch (e) {
    res.status(500).json({ error: 'unavailable' });
  }
});

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback simple ID
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/files', async (req, res) => {
  const order = String(req.query.order || 'opened').toLowerCase();
  const dedupe = String(req.query.dedupe || '').toLowerCase();
  const list = await readIndex();
  let items = [...list].sort((a, b) => {
    if (order === 'created') {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    }
    // default: order by lastOpenedAt desc
    return String(b.lastOpenedAt).localeCompare(String(a.lastOpenedAt));
  });

  if (dedupe === 'name') {
    const seen = new Set();
    const deduped = [];
    for (const it of items) {
      const key = (it && it.name) ? String(it.name).toLowerCase() : '';
      if (!key) { deduped.push(it); continue; }
      if (seen.has(key)) continue; // keep first (most recent) occurrence only
      seen.add(key);
      deduped.push(it);
    }
    items = deduped;
  }

  res.json(items.map(({ id, name, size, createdAt, lastOpenedAt, openCount }) => ({ id, name, size, createdAt, lastOpenedAt, openCount })));
});

app.get('/api/file/:id', async (req, res) => {
  const id = req.params.id;
  const filePath = path.join(UPLOADS_DIR, id + '.txt');
  try {
    const content = await fsp.readFile(filePath, 'utf8');
    res.type('text/plain').send(content);
  } catch (e) {
    if (e && e.code === 'ENOENT') return res.status(404).json({ error: 'not found' });
    console.error('read file failed', e);
    res.status(500).json({ error: 'read_failed' });
  }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no_file' });
    const name = req.file.originalname || 'untitled.txt';
    const content = req.file.buffer.toString('utf8');
    const id = newId();
    const createdAt = new Date().toISOString();
    const size = Buffer.byteLength(content, 'utf8');
    const lastOpenedAt = createdAt;
    const openCount = 0;

    const outPath = path.join(UPLOADS_DIR, id + '.txt');
    await fsp.writeFile(outPath, content, 'utf8');

    await queueWriteIndex(async (list) => {
      const normalized = Array.isArray(list) ? list : [];
      const next = normalized.filter((e) => e && e.id !== id);
      next.unshift({ id, name, size, createdAt, lastOpenedAt, openCount });
      // keep last 100
      return next.slice(0, 100);
    });

    res.json({ id, name, size, createdAt, lastOpenedAt, openCount, content });
  } catch (e) {
    console.error('upload failed', e);
    res.status(500).json({ error: 'upload_failed' });
  }
});

// Mark a file as opened now; bump lastOpenedAt, increment openCount, move to front
app.post('/api/open/:id', async (req, res) => {
  const id = req.params.id;
  const now = new Date().toISOString();
  let updatedEntry = null;
  await queueWriteIndex(async (list) => {
    const normalized = await readIndex();
    const idx = normalized.findIndex((e) => e && e.id === id);
    if (idx === -1) {
      // no change
      return normalized;
    }
    const entry = normalized[idx];
    updatedEntry = {
      ...entry,
      lastOpenedAt: now,
      openCount: (typeof entry.openCount === 'number' ? entry.openCount : 0) + 1
    };
    const next = normalized.filter((e) => e && e.id !== id);
    next.unshift(updatedEntry);
    return next.slice(0, 100);
  });

  if (!updatedEntry) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, id, lastOpenedAt: updatedEntry.lastOpenedAt, openCount: updatedEntry.openCount });
});

// 404 for non-static unknowns
app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Norin Reader server at http://0.0.0.0:${PORT}`);
});
