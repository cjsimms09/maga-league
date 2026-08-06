// Key-value document store. On Netlify it's backed by Netlify Blobs (strong
// consistency, no external database to set up). Locally it falls back to JSON
// files under data/ so the whole app runs and tests offline.
const fs = require('fs');
const path = require('path');

let blobStore = null;   // set when running on Netlify
let fileDir = null;     // set when running locally

function initBlobs(event) {
  if (blobStore) return true;
  try {
    const mod = require('@netlify/blobs');
    // Older runtimes configure lambda-compat functions from the event; newer
    // ones inject NETLIFY_BLOBS_CONTEXT automatically and dropped connectLambda.
    if (event && typeof mod.connectLambda === 'function') {
      try { mod.connectLambda(event); } catch (e) { /* fall through to env config */ }
    }
    blobStore = mod.getStore({ name: 'league', consistency: 'strong' });
    return true;
  } catch (e) {
    console.error('Netlify Blobs unavailable:', e.message);
    return false;
  }
}

const onNetlify = () => !!(process.env.NETLIFY || process.env.NETLIFY_LOCAL || process.env.LAMBDA_TASK_ROOT || process.env.AWS_LAMBDA_FUNCTION_NAME);

function initFiles() {
  fileDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  fs.mkdirSync(fileDir, { recursive: true });
}

function keyToFile(key) {
  return path.join(fileDir, key.replace(/[^a-zA-Z0-9_-]/g, '__') + '.json');
}

// If neither backend is initialized, fall back to files — but never silently
// on Netlify, where the function filesystem is read-only/ephemeral and a file
// fallback would mean quiet data loss.
function ensureBackend() {
  if (blobStore || fileDir) return;
  if (onNetlify() && !initBlobs()) {
    throw new Error('Netlify Blobs is not available to this function — data storage is offline. Redeploy the site; if it persists, check that the site has Blobs enabled (Site configuration → Blobs).');
  }
  if (!blobStore) initFiles();
}

async function get(key) {
  ensureBackend();
  if (blobStore) {
    const v = await blobStore.get(key, { type: 'json' });
    return v == null ? null : v;
  }
  const f = keyToFile(key);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

async function set(key, value) {
  ensureBackend();
  if (blobStore) return blobStore.setJSON(key, value);
  fs.writeFileSync(keyToFile(key), JSON.stringify(value));
}

async function del(key) {
  ensureBackend();
  if (blobStore) return blobStore.delete(key);
  const f = keyToFile(key);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

async function listKeys(prefix) {
  ensureBackend();
  if (blobStore) {
    const { blobs } = await blobStore.list({ prefix });
    return blobs.map(b => b.key);
  }
  const mangled = prefix.replace(/[^a-zA-Z0-9_-]/g, '__');
  return fs.readdirSync(fileDir)
    .filter(f => f.startsWith(mangled) && f.endsWith('.json'))
    .map(f => f.slice(0, -5).replace(/__/g, ':')); // best-effort reverse; keys use ':' as separator
}

async function getMany(keys) {
  return Promise.all(keys.map(k => get(k)));
}

module.exports = { initBlobs, initFiles, get, set, del, listKeys, getMany };
