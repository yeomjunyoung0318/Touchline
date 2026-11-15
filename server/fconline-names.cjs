'use strict';

const { nameKey } = require('./fcradar-aliases.cjs');
const METADATA_URL = 'https://open.api.nexon.com/static/fconline/meta/spid.json';
const REFRESH_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;

function indexNames(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 150000) throw new Error('Invalid FC Online metadata');
  const byId = new Map();
  const ambiguousIds = new Set();
  for (const row of rows) {
    const spid = row?.id;
    const name = typeof row?.name === 'string' ? row.name.trim() : '';
    if (!Number.isSafeInteger(spid) || spid < 100000000 || spid > 999999999 ||
        !/[가-힣]/.test(name) || name.length > 80) continue;
    // SPID is the season code followed by the six-digit base player ID.
    const id = spid % 1000000;
    if (!id) continue;
    if (byId.has(id) && byId.get(id) !== name) ambiguousIds.add(id);
    byId.set(id, name);
  }
  for (const id of ambiguousIds) byId.delete(id);
  if (!byId.size) throw new Error('FC Online metadata did not contain player names');

  const byName = new Map();
  for (const [id, name] of byId) {
    const key = nameKey(name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(id);
  }
  return { byId, byName };
}

function createFCOnlineNameLoader(fetchImpl = fetch) {
  let cache = null;
  let expiresAt = 0;
  let pending;
  return function loadNames() {
    if (Date.now() < expiresAt) return Promise.resolve(cache);
    if (!pending) {
      pending = (async () => {
        try {
          const response = await fetchImpl(METADATA_URL, {
            headers: { Accept: 'application/json' },
            redirect: 'error',
            signal: AbortSignal.timeout(5000),
          });
          if (!response.ok) throw new Error('FC Online metadata unavailable');
          cache = indexNames(await response.json());
          expiresAt = Date.now() + REFRESH_MS;
        } catch {
          cache = null;
          expiresAt = Date.now() + RETRY_MS;
        }
        return cache;
      })().finally(() => { pending = null; });
    }
    return pending;
  };
}

module.exports = { createFCOnlineNameLoader };
