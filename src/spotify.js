'use strict';
/*
 * Connexion officielle à Spotify (Spotify for Developers / Web API).
 * - Autorisation « Authorization Code + PKCE » : pas de secret stocké dans l'appli.
 * - La connexion se fait dans ton navigateur habituel, puis Spotify renvoie vers
 *   http://127.0.0.1:47823/callback (petit serveur local ouvert seulement pendant la connexion).
 * - Le jeton de rafraîchissement est chiffré avec le coffre de Windows (safeStorage).
 */
const { app, shell, safeStorage } = require('electron');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = 47823;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';
const SCOPES = [
  'streaming',                    // lecteur intégré (Web Playback SDK)
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-recently-played',
  'user-top-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-library-modify',
].join(' ');

const cfg = { clientId: '', refresh: '' };
let access = { token: '', expires: 0 };
let pendingLogin = null;
let refreshing = null;
const listeners = new Set();

const file = () => path.join(app.getPath('userData'), 'spotify.json');

// ---------------------------------------------------------------------------
// Stockage
// ---------------------------------------------------------------------------
function encrypt(text, enc) {
  return enc ? safeStorage.encryptString(text).toString('base64') : Buffer.from(text).toString('base64');
}
function decrypt(text, enc) {
  try {
    return enc ? safeStorage.decryptString(Buffer.from(text, 'base64')) : Buffer.from(text, 'base64').toString();
  } catch { return ''; }
}
function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
    cfg.clientId = raw.clientId || '';
    cfg.refresh = raw.refresh ? decrypt(raw.refresh, raw.enc) : '';
  } catch { /* pas encore configuré */ }
}
function save() {
  const enc = safeStorage.isEncryptionAvailable();
  try {
    fs.writeFileSync(file(), JSON.stringify({
      clientId: cfg.clientId,
      enc,
      refresh: cfg.refresh ? encrypt(cfg.refresh, enc) : '',
    }, null, 2));
  } catch (e) { console.warn('[Spotify] Sauvegarde impossible :', e.message); }
}

function status() {
  return {
    configured: !!cfg.clientId,
    loggedIn: !!cfg.refresh,
    clientId: cfg.clientId,
    redirectUri: REDIRECT_URI,
    loggingIn: !!pendingLogin,
  };
}
function emit() { for (const fn of listeners) { try { fn(status()); } catch { /* ignore */ } } }

function init() { load(); }

function setClientId(id) {
  id = String(id || '').trim();
  if (!/^[0-9a-f]{32}$/i.test(id)) {
    return { ok: false, error: 'Ce Client ID ne semble pas valide (32 caractères, chiffres et lettres a à f).' };
  }
  if (id !== cfg.clientId) {
    cfg.clientId = id;
    cfg.refresh = '';
    access = { token: '', expires: 0 };
    save();
    emit();
  }
  return { ok: true, status: status() };
}

function logout() {
  cfg.refresh = '';
  access = { token: '', expires: 0 };
  save();
  emit();
  return status();
}

function resetAll() {
  cfg.clientId = '';
  return logout();
}

// ---------------------------------------------------------------------------
// Connexion (PKCE)
// ---------------------------------------------------------------------------
function callbackPage(ok, message) {
  const color = ok ? '#1ed760' : '#f23f43';
  const title = ok ? 'PoseyHub est connecté à Spotify' : 'Connexion à Spotify impossible';
  const text = ok ? 'Tu peux fermer cet onglet et retourner sur PoseyHub.' : message;
  const safe = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>PoseyHub</title>
<style>body{margin:0;height:100vh;display:grid;place-items:center;background:#0f0f14;color:#e8e8f0;font-family:Segoe UI,system-ui,sans-serif;text-align:center}
.dot{width:64px;height:64px;border-radius:50%;background:${color};margin:0 auto 20px;display:grid;place-items:center;font-size:34px;color:#0f0f14;font-weight:800}
p{color:#8a8a9a}</style></head><body><div><div class="dot">${ok ? '✓' : '!'}</div>
<h1>${safe(title)}</h1><p>${safe(text)}</p></div></body></html>`;
}

async function tokenRequest(params) {
  let r;
  try {
    r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
  } catch {
    throw Object.assign(new Error('Pas de connexion Internet.'), { code: 'network' });
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    let msg = j.error_description || j.error || `Erreur ${r.status}`;
    if (j.error === 'invalid_client') msg = 'Client ID refusé par Spotify. Vérifie-le dans le tableau de bord Spotify for Developers.';
    if (j.error === 'invalid_grant') msg = 'Ta session Spotify a expiré, reconnecte-toi.';
    throw Object.assign(new Error(msg), { code: j.error || 'token' });
  }
  access = { token: j.access_token, expires: Date.now() + (Number(j.expires_in || 3600) - 60) * 1000 };
  if (j.refresh_token) cfg.refresh = j.refresh_token;
  save();
  return access.token;
}

function login() {
  if (!cfg.clientId) return Promise.reject(new Error('Ajoute d’abord ton Client ID.'));
  if (pendingLogin) {
    shell.openExternal(pendingLogin.url);
    return pendingLogin.promise;
  }

  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');
  const url = AUTH_URL + '?' + new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: SCOPES,
    show_dialog: 'true',
  }).toString();

  const promise = new Promise((resolve, reject) => {
    let done = false;
    let timer = null;
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, REDIRECT_URI);
      if (u.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
      const err = u.searchParams.get('error');
      const code = u.searchParams.get('code');
      const goodState = u.searchParams.get('state') === state;
      let error = null;
      if (err) error = err === 'access_denied' ? 'Tu as refusé l’accès.' : `Spotify a répondu : ${err}`;
      else if (!goodState || !code) error = 'Réponse de Spotify invalide, relance la connexion.';

      const respond = (ok, msg) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(callbackPage(ok, msg));
      };
      if (error) { respond(false, error); finish(new Error(error)); return; }
      tokenRequest({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: cfg.clientId,
        code_verifier: verifier,
      }).then(() => { respond(true); finish(null); })
        .catch((e) => { respond(false, e.message); finish(e); });
    });

    function finish(error) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      server.close();
      pendingLogin = null;
      emit();
      if (error) reject(error); else resolve(status());
    }

    timer = setTimeout(() => finish(new Error('Temps écoulé, relance la connexion.')), 5 * 60 * 1000);
    server.on('error', (e) => finish(e.code === 'EADDRINUSE'
      ? new Error(`Le port ${PORT} est déjà utilisé par un autre programme. Ferme-le puis réessaie.`)
      : e));
    server.listen(PORT, '127.0.0.1', () => shell.openExternal(url));
  });

  pendingLogin = { url, promise };
  emit();
  return promise;
}

async function getToken(force = false) {
  if (!force && access.token && Date.now() < access.expires) return access.token;
  if (!cfg.refresh) throw Object.assign(new Error('Non connecté à Spotify.'), { code: 'not_logged' });
  if (!refreshing) {
    refreshing = tokenRequest({ grant_type: 'refresh_token', refresh_token: cfg.refresh, client_id: cfg.clientId })
      .catch((e) => {
        if (e.code === 'invalid_grant' || e.code === 'invalid_client') {
          cfg.refresh = '';
          access = { token: '', expires: 0 };
          save();
          emit();
          e.code = 'not_logged';
        }
        throw e;
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

// ---------------------------------------------------------------------------
// Appels à l'API Web
// ---------------------------------------------------------------------------
function humanError(statusCode, reason, message) {
  if (reason === 'PREMIUM_REQUIRED') return 'Il faut Spotify Premium pour contrôler la lecture.';
  if (reason === 'NO_ACTIVE_DEVICE') return 'Aucun appareil Spotify actif : choisis-en un en bas à droite.';
  if (statusCode === 403) {
    return 'Spotify refuse l’accès. Vérifie que ce compte est ajouté dans « User Management » de ton appli Spotify for Developers'
      + (message ? ` (${message})` : '') + '.';
  }
  if (statusCode === 404) return message || 'Introuvable sur Spotify.';
  if (statusCode >= 500) return 'Spotify ne répond pas correctement, réessaie dans un instant.';
  return message || `Erreur Spotify ${statusCode}`;
}

async function api(method, p, { query, body } = {}) {
  method = String(method || 'GET').toUpperCase();
  if (!['GET', 'PUT', 'POST', 'DELETE'].includes(method) || typeof p !== 'string' || !p.startsWith('/')) {
    return { ok: false, status: 400, error: 'Requête invalide.' };
  }
  let token;
  try { token = await getToken(); } catch (e) {
    return { ok: false, status: 401, error: e.message, code: e.code || 'not_logged' };
  }

  const url = new URL(API + p);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    let r;
    try {
      r = await fetch(url, {
        method,
        headers: {
          Authorization: 'Bearer ' + token,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : (method === 'GET' ? undefined : ''),
      });
    } catch {
      return { ok: false, status: 0, error: 'Pas de connexion Internet.' };
    }

    if (r.status === 401 && attempt === 0) {
      try { token = await getToken(true); continue; } catch (e) {
        return { ok: false, status: 401, error: e.message, code: e.code || 'not_logged' };
      }
    }
    if (r.status === 429 && attempt < 2) {
      const wait = Math.min(10, Math.max(1, parseInt(r.headers.get('retry-after') || '1', 10)));
      await new Promise((res) => setTimeout(res, wait * 1000));
      continue;
    }

    const text = await r.text().catch(() => '');
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!r.ok) {
      const reason = data?.error?.reason;
      return { ok: false, status: r.status, reason, error: humanError(r.status, reason, data?.error?.message) };
    }
    return { ok: true, status: r.status, data };
  }
  return { ok: false, status: 429, error: 'Spotify demande de ralentir, réessaie dans un instant.' };
}

// Commandes rapides (zone de notification)
async function control(action) {
  if (!cfg.refresh) return;
  if (action === 'playpause') {
    const st = await api('GET', '/me/player');
    if (st.ok && st.data?.is_playing) await api('PUT', '/me/player/pause');
    else await api('PUT', '/me/player/play');
  } else if (action === 'next') {
    await api('POST', '/me/player/next');
  } else if (action === 'previous') {
    await api('POST', '/me/player/previous');
  }
}

module.exports = {
  init, status, setClientId, login, logout, resetAll, getToken, api, control,
  onChange: (fn) => listeners.add(fn),
  REDIRECT_URI,
};
