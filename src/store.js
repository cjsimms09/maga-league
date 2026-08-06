// Key-value document store. On Netlify it's backed by Netlify Blobs (no
// external database to set up). Locally it falls back to JSON files under
// data/ so the whole app runs and tests offline.
//
// Blobs is used with its default (eventual) consistency — strong consistency
// needs an 'uncachedEdgeURL' that lambda-compat functions don't get. To keep
// read-after-write correct anyway, every write is mirrored into an in-memory
// overlay: within a warm function instance (the overwhelmingly common case
// for a 10-person league) reads always see the latest write immediately,
// while other instances converge within Netlify's propagation window.
const fs = require('fs');
const path = require('path');

let blobStore = null;   // set when running on Netlify
let fileDir = null;     // set when running locally

const OVERLAY_TTL_MS = 10 * 60 * 1000;
const overlay = new Map(); // key -> { value (deep-cloned; null = deleted), t }

function overlayPut(key, value) {
  overlay.set(key, { value: value == null ? null : structuredClone(value), t: Date.now() });
}
function overlayGet(key) {
  const hit = overlay.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.t > OVERLAY_TTL_MS) { overlay.delete(key); return undefined; }
  return hit.value == null ? null : structuredClone(hit.value);
}

function initBlobs(event) {
  // Rebuilt on EVERY invocation: auth tokens in the blobs context expire, so a
  // client cached across a warm instance's lifetime eventually starts failing
  // with "Token expired". The invocation event / env always carry fresh creds.
  try {
    const mod = require('@netlify/blobs');
    // Lambda-compat invocations carry fresh per-request credentials on the event.
    if (event && event.blobs && typeof mod.connectLambda === 'function') {
      try { mod.connectLambda(event); } catch (e) { /* fall through to env config */ }
    }
    blobStore = mod.getStore({ name: 'league' });
    return true;
  } catch (e) {
    if (!blobStore) console.error('Netlify Blobs unavailable:', e.message);
    return !!blobStore;
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
    const fresh = overlayGet(key);
    if (fresh !== undefined) return fresh;
    const v = await blobStore.get(key, { type: 'json' });
    return v == null ? null : v;
  }
  const f = keyToFile(key);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

async function set(key, value) {
  ensureBackend();
  if (blobStore) {
    overlayPut(key, value);
    return blobStore.setJSON(key, value);
  }
  fs.writeFileSync(keyToFile(key), JSON.stringify(value));
}

async function del(key) {
  ensureBackend();
  if (blobStore) {
    overlayPut(key, null);
    return blobStore.delete(key);
  }
  const f = keyToFile(key);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

async function listKeys(prefix) {
  ensureBackend();
  if (blobStore) {
    const { blobs } = await blobStore.list({ prefix });
    const keys = new Set(blobs.map(b => b.key));
    // Merge recent same-instance writes/deletes the listing may not show yet.
    for (const [key, hit] of overlay) {
      if (!key.startsWith(prefix) || Date.now() - hit.t > OVERLAY_TTL_MS) continue;
      if (hit.value == null) keys.delete(key); else keys.add(key);
    }
    return [...keys];
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
