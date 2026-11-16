'use strict';
/*
 * Vencord (https://github.com/Vendicated/Vencord, licence GPL-3.0, par Vendicated)
 * Simply Hub n'inclut pas Vencord : il télécharge la version « navigateur » officielle
 * (browser.js + browser.css) depuis les publications GitHub de Vencord, la garde dans
 * %APPDATA%\Simply Hub\vencord et l'injecte dans Discord au chargement de la page,
 * comme le fait l'extension de navigateur.
 */
const fs = require('fs');
const path = require('path');

const BASE = 'https://github.com/Vendicated/Vencord/releases/download/devbuild/';
const FILES = { js: 'browser.js', css: 'browser.css' };
const CHECK_EVERY = 12 * 60 * 60 * 1000;

let dir = null;
let meta = { etag: {}, checkedAt: 0, updatedAt: 0 };
const cache = { js: null, css: null };
const state = { busy: false, error: null };
const listeners = new Set();
const emit = () => { for (const fn of listeners) { try { fn(status()); } catch { /* ignore */ } } };

function init(userData) {
  dir = path.join(userData, 'vencord');
  try { meta = { ...meta, ...JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')) }; } catch { /* rien */ }
  for (const [k, f] of Object.entries(FILES)) {
    try { cache[k] = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { cache[k] = null; }
  }
}

function saveMeta() {
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2)); } catch { /* ignore */ }
}

const installed = () => !!cache.js;
function version() {
  const m = /^\/\/ Vencord ([0-9a-f]{6,})/m.exec(cache.js || '');
  return m ? m[1] : null;
}

function status() {
  return {
    installed: installed(),
    version: version(),
    updatedAt: meta.updatedAt || 0,
    checkedAt: meta.checkedAt || 0,
    busy: state.busy,
    error: state.error,
  };
}

async function download(name, etag) {
  const r = await fetch(BASE + name, { headers: etag ? { 'If-None-Match': etag } : {}, redirect: 'follow' });
  if (r.status === 304) return { unchanged: true };
  if (!r.ok) throw new Error(`Téléchargement de ${name} impossible (erreur ${r.status}).`);
  return { text: await r.text(), etag: r.headers.get('etag') };
}

/**
 * Télécharge (ou met à jour) Vencord.
 * @returns {Promise<boolean>} true si de nouveaux fichiers ont été installés
 */
async function update(force = false) {
  if (state.busy) return false;
  state.busy = true;
  state.error = null;
  emit();
  try {
    const results = {};
    for (const [k, f] of Object.entries(FILES)) {
      results[k] = await download(f, force || !cache[k] ? null : meta.etag[f]);
    }
    meta.checkedAt = Date.now();
    let changed = false;
    if (Object.values(results).some((r) => !r.unchanged)) {
      // On télécharge tout à nouveau si un seul fichier a changé, pour rester cohérent
      for (const [k, f] of Object.entries(FILES)) {
        if (results[k].unchanged) results[k] = await download(f, null);
      }
      if (!/Vencord/.test(results.js.text || '') || (results.js.text || '').length < 100000) {
        throw new Error('Le fichier Vencord téléchargé semble incomplet.');
      }
      fs.mkdirSync(dir, { recursive: true });
      for (const [k, f] of Object.entries(FILES)) {
        fs.writeFileSync(path.join(dir, f), results[k].text);
        cache[k] = results[k].text;
        meta.etag[f] = results[k].etag || null;
      }
      meta.updatedAt = Date.now();
      changed = true;
    }
    saveMeta();
    return changed;
  } catch (e) {
    state.error = e.message || String(e);
    return false;
  } finally {
    state.busy = false;
    emit();
  }
}

/** Au démarrage : installe si besoin, sinon vérifie les nouveautés toutes les 12 h. */
async function ensure() {
  if (!installed()) return update(true);
  if (Date.now() - (meta.checkedAt || 0) > CHECK_EVERY) return update(false);
  return false;
}

function remove() {
  for (const f of Object.values(FILES)) { try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ } }
  cache.js = null;
  cache.css = null;
  meta = { etag: {}, checkedAt: 0, updatedAt: 0 };
  saveMeta();
  emit();
}

module.exports = {
  init, update, ensure, remove, status,
  code: () => (cache.js ? { js: cache.js, css: cache.css } : null),
  css: () => cache.css,
  onChange: (fn) => listeners.add(fn),
};
