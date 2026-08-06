// Key-value document store. On Netlify it's backed by Netlify Blobs (strong
// consistency, no external database to set up). Locally it falls back to JSON
// files under data/ so the whole app runs and tests offline.
const fs = require('fs');
const path = require('path');

let blobStore = null;   // set when running on Netlify
let fileDir = null;     // set when running locally

function initBlobs(event) {
  // Lambda-compat functions get their Blobs context from the invocation event.
  try {
    const { connectLambda, getStore } = require('@netlify/blobs');
    if (event) connectLambda(event);
    blobStore = getStore({ name: 'league', consistency: 'strong' });
    return true;
  } catch (e) {
    return false;
  }
}

function initFiles() {
  fileDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  fs.mkdirSync(fileDir, { recursive: true });
}

function keyToFile(key) {
  return path.join(fileDir, key.replace(/[^a-zA-Z0-9_-]/g, '__') + '.json');
}

// If neither backend is initialized (e.g. blobs unavailable), fall back to files.
function ensureBackend() {
  if (!blobStore && !fileDir) initFiles();
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
