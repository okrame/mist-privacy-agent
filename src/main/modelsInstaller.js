const { app, dialog, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { https } = require('follow-redirects');
const crypto = require('crypto');

const MODELS = [
  {
    filename: 'unsloth.llama3b.Q4_K_M.smalljson.proposals.gguf',
    url: 'https://huggingface.co/gufett0/unsloth-llama3B/resolve/main/unsloth.llama3b.Q4_K_M.smalljson.proposals.gguf', 
    sha256: '1f9ec8213cf2748260da7b9697ae76798a623ab63ad6e42e19cfe8285738b357' 
  },
  {
    filename: 'DeepSeek-R1-Distill-Llama-8B-Q4_K_S.gguf',
    url: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Llama-8B-GGUF/resolve/main/DeepSeek-R1-Distill-Llama-8B-Q4_K_S.gguf',
    sha256: '89cfcce9b4d2855f0e6dfa8c6c14e664e7a45739e1a9eb1bc6265ebee41406a8' 
  }
];

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(filePath);
    s.on('error', reject);
    s.on('data', (d) => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
  });
}

function downloadToFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
const file = fs.createWriteStream(dest);
https.get(url, {
  headers: {
    'User-Agent': 'Mist/1.0 (+https://local)',
    'Accept': '*/*'
  },
  maxRedirects: 10 // optional, follow-redirects supports this
}, (res) => {

  if (res.statusCode !== 200) {
    file.close(); fs.rmSync(dest, { force: true });
    return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
  }
      const total = Number(res.headers['content-length'] || 0);
      let received = 0;

      res.on('data', (chunk) => {
        received += chunk.length;
        if (onProgress && total) onProgress(received / total);
      });
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', (err) => {
      file.close(); fs.rmSync(dest, { force: true });
      reject(err);
    });
  });
}

async function ensureModelsReady(win /* BrowserWindow */) {
  const baseDir = path.join(app.getPath('userData'), 'models');
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

  const missing = MODELS.filter(m => !fs.existsSync(path.join(baseDir, m.filename)));
  if (missing.length === 0) return { downloaded: false };

  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['Download', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    title: 'Model download required',
    message: 'Large language models are required (~6–8 GB). Download now?',
    detail: missing.map(m => `• ${m.filename}`).join('\n')
  });
  if (response !== 0) throw new Error('Models not installed');

  // Progress bar in dock / title
  try { win.webContents.send('models:start'); } catch {}
  win.setProgressBar(0.01);
  let completed = 0;

  for (const m of missing) {
    const tmpPath = path.join(baseDir, `${m.filename}.part`);
    const finalPath = path.join(baseDir, m.filename);

    await downloadToFile(m.url, tmpPath, (p) => {
      // average across all downloads
      const avg = (completed + p) / missing.length;
      win.setProgressBar(Math.max(0.01, Math.min(0.99, avg)));
      win.webContents.send('models:progress', { file: m.filename, progress: avg });
    });

    const hash = await sha256File(tmpPath);
    if (m.sha256 && hash.toLowerCase() !== m.sha256.toLowerCase()) {
      fs.rmSync(tmpPath, { force: true });
      throw new Error(`SHA256 mismatch for ${m.filename}`);
    }
    fs.renameSync(tmpPath, finalPath);
    completed += 1;
  }
  win.setProgressBar(-1);
  try { win.webContents.send('models:done'); } catch {}
  return { downloaded: true };
}

module.exports = { ensureModelsReady };
