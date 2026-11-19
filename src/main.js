'use strict';
/*
 * Simply Hub — YouTube, Discord, Spotify et tous tes jeux dans une seule appli de bureau.
 * PoseyDevs
 */
const {
  app, BrowserWindow, WebContentsView, ipcMain, shell, session, Menu, Tray,
  nativeImage, desktopCapturer, dialog, screen, clipboard, components, protocol, net,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const updater = require('./updater');
const games = require('./games');
const vencord = require('./vencord');

// Données de l'appli : l'ancien nom était « PoseyHub ». Si ce dossier existe déjà,
// on continue de l'utiliser pour garder les connexions, réglages et jeux.
{
  const appData = app.getPath('appData');
  const oldDir = path.join(appData, 'PoseyHub');
  const newDir = path.join(appData, 'Simply Hub');
  app.setPath('userData', !fs.existsSync(newDir) && fs.existsSync(oldDir) ? oldDir : newDir);
}

// Protocole interne poseyhub:// pour les pages de l'appli (Spotify, Jeux, Réglages)
protocol.registerSchemesAsPrivileged([{
  scheme: 'poseyhub',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const SIDEBAR = 76;   // largeur de la barre latérale (px)
const TOPBAR = 46;    // hauteur de la barre du haut (px)
const GAP = 8;        // marge autour de la carte qui contient la page
const RADIUS = 14;    // arrondi de la carte
const ASSETS = path.join(__dirname, '..', 'assets');
const ICON = path.join(ASSETS, process.platform === 'win32' ? 'icon.ico' : 'icon.png');

const SERVICES = [
  {
    id: 'youtube', name: 'YouTube', color: '#ff3b4e',
    url: 'https://www.youtube.com/',
    domains: ['youtube.com', 'youtu.be', 'youtube-nocookie.com', 'ytimg.com', 'googlevideo.com'],
  },
  {
    id: 'discord', name: 'Discord', color: '#5b6cff',
    url: 'https://discord.com/app',
    domains: ['discord.com', 'discord.gg', 'discordapp.com', 'discord.new', 'discordapp.net'],
    preload: 'discordPreload.js',
  },
  {
    // Lecteur web officiel de Spotify
    id: 'spotify', name: 'Spotify', color: '#1fdc6a',
    url: 'https://open.spotify.com/',
    domains: ['spotify.com', 'spotify.link', 'scdn.co', 'spotifycdn.com', 'spotifycdn.net'],
  },
  {
    // Gaming Hub : tous les jeux installés sur le PC
    id: 'games', name: 'Jeux', color: '#ffb21e',
    url: 'poseyhub://app/games.html',
    local: true, preload: 'gamesPreload.js', domains: [],
  },
  // Streaming vidéo : chargés seulement quand on les ouvre (lazy), pour ne pas alourdir le démarrage
  {
    id: 'netflix', name: 'Netflix', color: '#e50914', group: 'streaming', lazy: true,
    url: 'https://www.netflix.com/browse',
    domains: ['netflix.com', 'nflxext.com', 'nflximg.net', 'nflxvideo.net', 'nflxso.net'],
  },
  {
    id: 'disney', name: 'Disney+', color: '#1f6bff', group: 'streaming', lazy: true,
    url: 'https://www.disneyplus.com/',
    domains: ['disneyplus.com', 'disney-plus.net', 'bamgrid.com', 'dssott.com', 'go.com', 'disney.com'],
  },
  {
    id: 'hbo', name: 'HBO Max', color: '#8b3dff', group: 'streaming', lazy: true,
    url: 'https://play.hbomax.com/',
    domains: ['hbomax.com', 'max.com', 'hbo.com', 'discomax.com'],
  },
  {
    id: 'prime', name: 'Prime Video', color: '#1aa3e8', group: 'streaming', lazy: true,
    url: 'https://www.primevideo.com/',
    domains: ['primevideo.com', 'amazon.com', 'amazon.fr', 'amazon.de', 'amazon.co.uk', 'amazon.es', 'amazon.it', 'media-amazon.com', 'aiv-cdn.net', 'aiv-delivery.net'],
  },
  {
    // Moteur de recherche au choix (page officielle). Les liens s'ouvrent dans l'onglet, comme un navigateur.
    id: 'search', name: 'Recherche', color: '#4285f4', group: 'web', browser: true,
    url: 'https://www.google.com/', domains: [],
  },
];
// Page Réglages : s'affiche comme un service, mais n'apparaît pas dans la liste
const SETTINGS_PAGE = {
  id: 'settings', name: 'Réglages', color: '#9aa0b4',
  url: 'poseyhub://app/settings.html',
  local: true, preload: 'settingsPreload.js', domains: [], page: true,
};
const ALL_PAGES = [...SERVICES, SETTINGS_PAGE];

const THEMES = {
  nuit: { name: 'Nuit', bg: '#0f0f14', deep: '#0a0a0f', panel: '#17171f', panel2: '#1d1d27', hover: '#25252f', line: '#22222c', text: '#e9e9f1', muted: '#8b8b9c' },
  oled: { name: 'Noir OLED', bg: '#000000', deep: '#000000', panel: '#0e0e12', panel2: '#15151b', hover: '#1d1d24', line: '#18181e', text: '#ededf3', muted: '#86868f' },
  ardoise: { name: 'Ardoise', bg: '#111827', deep: '#0c1220', panel: '#182235', panel2: '#1e2a40', hover: '#27344e', line: '#1f2a3e', text: '#e6ebf5', muted: '#8c98ae' },
  aubergine: { name: 'Aubergine', bg: '#151019', deep: '#0f0b13', panel: '#1e1725', panel2: '#261d2f', hover: '#31263c', line: '#2a2033', text: '#f0e9f4', muted: '#9c90a8' },
  foret: { name: 'Forêt', bg: '#0e1512', deep: '#0a100d', panel: '#15201b', panel2: '#1b2822', hover: '#24342c', line: '#1d2a24', text: '#e7f1ec', muted: '#88a096' },
};
// Thème « Selon l'onglet » : l'interface prend les couleurs de chaque service
const SERVICE_THEMES = {
  youtube: { bg: '#0f0f0f', deep: '#0a0a0a', panel: '#212121', panel2: '#272727', hover: '#3d3d3d', line: '#272727', text: '#f1f1f1', muted: '#aaaaaa' },
  discord: { bg: '#1e1f22', deep: '#18191c', panel: '#2b2d31', panel2: '#313338', hover: '#3f4147', line: '#26282c', text: '#f2f3f5', muted: '#949ba4' },
  spotify: { bg: '#000000', deep: '#000000', panel: '#121212', panel2: '#1f1f1f', hover: '#2a2a2a', line: '#1a1a1a', text: '#ffffff', muted: '#b3b3b3' },
  games: { bg: '#0f0e0b', deep: '#0a0907', panel: '#1a1813', panel2: '#211e17', hover: '#2b271e', line: '#24211a', text: '#f1ece2', muted: '#a29a88' },
  netflix: { bg: '#141414', deep: '#0b0b0b', panel: '#1f1f1f', panel2: '#262626', hover: '#333333', line: '#2a2a2a', text: '#e5e5e5', muted: '#a3a3a3' },
  disney: { bg: '#1a1d29', deep: '#13151f', panel: '#252a3c', panel2: '#2d3349', hover: '#3a415c', line: '#2a2f42', text: '#f9f9f9', muted: '#a8adc0' },
  hbo: { bg: '#0b0a14', deep: '#07060e', panel: '#16142a', panel2: '#1e1b36', hover: '#29254a', line: '#1f1c35', text: '#f3f1fb', muted: '#9f9ab8' },
  prime: { bg: '#0f171e', deep: '#0a1016', panel: '#1a242f', panel2: '#232f3e', hover: '#2e3c4e', line: '#233040', text: '#f2f4f6', muted: '#8197a4' },
};
// Moteurs de recherche de l'onglet « Recherche » (pages officielles). %s = texte recherché
const ENGINES = [
  { id: 'google', name: 'Google', color: '#4285f4', bg: '#1f1f1f', desc: 'Le moteur le plus utilisé', home: 'https://www.google.com/', search: 'https://www.google.com/search?q=%s' },
  { id: 'bing', name: 'Bing', color: '#0c8484', bg: '#1b1a19', desc: 'Le moteur de Microsoft', home: 'https://www.bing.com/', search: 'https://www.bing.com/search?q=%s' },
  { id: 'duckduckgo', name: 'DuckDuckGo', color: '#de5833', bg: '#1c1c1c', desc: 'Ne te piste pas', home: 'https://duckduckgo.com/', search: 'https://duckduckgo.com/?q=%s' },
  { id: 'qwant', name: 'Qwant', color: '#5c6cff', bg: '#141621', desc: 'Français, respecte la vie privée', home: 'https://www.qwant.com/', search: 'https://www.qwant.com/?q=%s' },
  { id: 'ecosia', name: 'Ecosia', color: '#2ea86b', bg: '#151a17', desc: 'Finance des arbres avec ses revenus', home: 'https://www.ecosia.org/', search: 'https://www.ecosia.org/search?q=%s' },
  { id: 'brave', name: 'Brave Search', color: '#fb542b', bg: '#14151d', desc: 'Son propre index, sans pistage', home: 'https://search.brave.com/', search: 'https://search.brave.com/search?q=%s' },
  { id: 'startpage', name: 'Startpage', color: '#6573ff', bg: '#171a29', desc: 'Résultats de Google, en privé', home: 'https://www.startpage.com/', search: 'https://www.startpage.com/sp/search?query=%s' },
  { id: 'yahoo', name: 'Yahoo', color: '#7e1fff', bg: '#17141f', desc: 'Recherche et actualités', home: 'https://search.yahoo.com/', search: 'https://search.yahoo.com/search?p=%s' },
  { id: 'perplexity', name: 'Perplexity', color: '#20a0a8', bg: '#191a1a', desc: 'Réponses par IA, avec les sources', home: 'https://www.perplexity.ai/', search: 'https://www.perplexity.ai/search?q=%s' },
  { id: 'lilo', name: 'Lilo', color: '#16b39a', bg: '#141a19', desc: 'Français, finance des projets solidaires', home: 'https://search.lilo.org/', search: 'https://search.lilo.org/?q=%s' },
  { id: 'yandex', name: 'Yandex', color: '#fc3f1d', bg: '#1c1c1c', desc: 'Moteur international', home: 'https://yandex.com/', search: 'https://yandex.com/search/?text=%s' },
  { id: 'kagi', name: 'Kagi', color: '#ffb319', bg: '#1a1b20', desc: 'Payant, sans publicité', home: 'https://kagi.com/', search: 'https://kagi.com/search?q=%s' },
];
function engine() {
  const c = settings.customEngine;
  if (settings.searchEngine === 'custom' && c?.home) {
    return { id: 'custom', name: c.name || 'Personnalisé', color: '#9aa0b4', bg: '#141418', desc: 'Moteur personnalisé', home: c.home, search: c.search || '' };
  }
  return ENGINES.find((e) => e.id === settings.searchEngine) || ENGINES[0];
}
function normalizeUrl(u) {
  u = String(u || '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.toString() : null; } catch { return null; }
}
// Adresse de départ et couleur d'un service (l'onglet Recherche dépend du moteur choisi)
const urlOf = (s) => (s.id === 'search' ? engine().home : s.url);
const colorOf = (s) => (s.id === 'search' ? engine().color : s.color);

const ACCENTS = ['#5b6cff', '#ff3b4e', '#1fdc6a', '#ffb21e', '#c06cff', '#22c3ee', '#ff6fb1', '#f4f4f8'];

// Pages de connexion qui ont le droit de s'ouvrir en petite fenêtre pop-up
const LOGIN_HOSTS = [
  'accounts.google.com', 'accounts.youtube.com', 'facebook.com', 'appleid.apple.com',
  'hcaptcha.com', 'challenges.cloudflare.com', 'accounts.spotify.com',
];

const ALLOWED_PERMISSIONS = new Set([
  'notifications', 'media', 'fullscreen', 'clipboard-read', 'clipboard-sanitized-write',
  'mediaKeySystem', 'display-capture', 'speaker-selection', 'idle-detection', 'pointerLock',
]);

// User-agent de Chrome classique (sans « Electron ») pour que les sites ne bloquent pas l'appli
const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
app.userAgentFallback = CHROME_UA;
app.setAppUserModelId('com.poseydevs.poseyhub');

// ---------------------------------------------------------------------------
// Réglages (sauvegardés dans %APPDATA%/Simply Hub/settings.json)
// ---------------------------------------------------------------------------
const DEFAULTS = {
  lastService: 'youtube',
  bounds: null,
  maximized: false,
  closeToTray: true,
  alwaysOnTop: false,
  trayHintShown: false,
  updatePromptedFor: null,    // version pour laquelle la fenêtre « prête à installer » s'est déjà affichée
  lastRunVersion: null,       // pour afficher les nouveautés après une mise à jour
  startHidden: true,          // au démarrage de Windows : rester dans la zone de notification
  preloadAll: true,           // charger tous les services au lancement
  theme: 'auto',              // 'auto' = selon l'onglet, sinon un des THEMES
  themeVersion: 2,
  accentMode: 'service',      // 'service' (couleur du service ouvert) ou 'fixe'
  accent: '#5b6cff',
  showLabels: true,
  badges: true,
  taskbarBadge: true,
  zoom: 100,
  searchEngine: 'google',
  customEngine: null,         // { name, home, search }
  vencord: true,
  order: SERVICES.map((s) => s.id),
  enabled: Object.fromEntries(SERVICES.map((s) => [s.id, true])),
  notifications: Object.fromEntries(SERVICES.map((s) => [s.id, s.id === 'discord'])),
  muted: Object.fromEntries(SERVICES.map((s) => [s.id, false])),
};
const settings = JSON.parse(JSON.stringify(DEFAULTS));
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    for (const [k, v] of Object.entries(saved)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && DEFAULTS[k] && typeof DEFAULTS[k] === 'object' && !Array.isArray(DEFAULTS[k])) {
        settings[k] = { ...DEFAULTS[k], ...v };
      } else settings[k] = v;
    }
  } catch { /* première ouverture */ }
  // ordre : garder les services connus, ajouter les nouveaux à la fin
  const known = SERVICES.map((s) => s.id);
  settings.order = [...(settings.order || []).filter((id) => known.includes(id)), ...known.filter((id) => !(settings.order || []).includes(id))];
  if (settings.themeVersion !== 2) { settings.theme = 'auto'; settings.themeVersion = 2; } // nouveau : thème par onglet
  if (settings.theme !== 'auto' && !THEMES[settings.theme]) settings.theme = 'auto';
  if (!SERVICES.some((s) => settings.enabled[s.id])) settings.enabled.youtube = true;
}
function saveSettingsNow() {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch { /* ignore */ }
}
let saveTimer = null;
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSettingsNow, 400);
}

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------
/** @type {BrowserWindow} */ let win = null;
/** @type {Tray} */ let tray = null;
const views = {};            // id -> { view, badge, loading, title }
let activeId = null;
let previousId = null;
let htmlFullscreen = false;
let quitting = false;
const launchedAtLogin = process.argv.includes('--hidden');

const pageById = (id) => ALL_PAGES.find((s) => s.id === id);
const visibleServices = () => settings.order.map((id) => SERVICES.find((s) => s.id === id)).filter((s) => s && settings.enabled[s.id]);
const activeWc = () => (activeId && views[activeId] ? views[activeId].view.webContents : null);
const wcOf = (id) => views[id]?.view.webContents;
// Couleurs d'une page : celles du service (thème automatique) ou le thème choisi
function lighten(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (255 - c) * amount).toString(16).padStart(2, '0')).join('');
}
function derivePalette(bg) {
  return { bg, deep: bg, panel: lighten(bg, 0.06), panel2: lighten(bg, 0.1), hover: lighten(bg, 0.17), line: lighten(bg, 0.08), text: '#ececf1', muted: '#9c9cab' };
}
function paletteFor(id) {
  if (settings.theme !== 'auto') return THEMES[settings.theme] || THEMES.nuit;
  if (id === 'search') return derivePalette(engine().bg);
  return SERVICE_THEMES[id] || THEMES.nuit;
}
const theme = () => paletteFor(activeId || settings.lastService);

function hostMatches(url, domains) {
  try {
    const h = new URL(url).hostname;
    return domains.some((d) => h === d || h.endsWith('.' + d));
  } catch { return false; }
}

function openExternal(url) {
  if (/^(https?|mailto|spotify|discord):/i.test(url)) shell.openExternal(url);
}

// ---------------------------------------------------------------------------
// Thème : variables CSS injectées dans l'interface et les pages internes
// ---------------------------------------------------------------------------
function themeCss(t) {
  return `:root{--bg:${t.bg}!important;--deep:${t.deep}!important;--panel:${t.panel}!important;--panel2:${t.panel2}!important;`
    + `--hover:${t.hover}!important;--line:${t.line}!important;--text:${t.text}!important;--muted:${t.muted}!important;}`
    + `html,body{background:${t.bg}!important;}`;
}
const themeKeys = new Map();
async function applyTheme(wc, t) {
  if (!wc || wc.isDestroyed()) return;
  const css = themeCss(t);
  const old = themeKeys.get(wc.id);
  if (old && old.css === css) return;
  try {
    const key = await wc.insertCSS(css);
    themeKeys.set(wc.id, { key, css });
    if (old) wc.removeInsertedCSS(old.key).catch(() => {});
  } catch { /* page en cours de chargement */ }
}
// Barre latérale, barre du haut et boutons de la fenêtre : couleurs de l'onglet ouvert
function applyChromeTheme() {
  if (!win || win.isDestroyed()) return;
  const t = theme();
  win.setBackgroundColor(t.bg);
  try { win.setTitleBarOverlay({ color: t.bg, symbolColor: t.text, height: TOPBAR }); } catch { /* ignore */ }
  applyTheme(win.webContents, t);
  if (overlay && !overlay.webContents.isDestroyed()) applyTheme(overlay.webContents, t);
}
function applyThemeEverywhere() {
  applyChromeTheme();
  for (const [id, st] of Object.entries(views)) {
    const t = paletteFor(id);
    st.view.setBackgroundColor(t.bg);
    if (pageById(id)?.local) applyTheme(st.view.webContents, t);
  }
}

// ---------------------------------------------------------------------------
// Sessions (une par service, connexion conservée entre les lancements)
// ---------------------------------------------------------------------------
const preparedSessions = new WeakSet();
function setupSession(ses, serviceId) {
  if (preparedSessions.has(ses)) return;
  preparedSessions.add(ses);

  ses.setUserAgent(CHROME_UA);
  const allowed = (permission) => ALLOWED_PERMISSIONS.has(permission)
    && (permission !== 'notifications' || !!settings.notifications[serviceId] || pageById(serviceId)?.local);
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => allowed(permission));
  try { ses.setSpellCheckerLanguages(['fr', 'en-US']); } catch { /* géré par Windows */ }

  // Vencord : Discord bloque les scripts et styles externes (thèmes, plugins) par sa politique CSP
  if (serviceId === 'discord') {
    ses.webRequest.onHeadersReceived({ urls: ['https://discord.com/*', 'https://*.discord.com/*'] }, (details, cb) => {
      if (!settings.vencord || !details.responseHeaders) { cb({}); return; }
      const headers = { ...details.responseHeaders };
      for (const k of Object.keys(headers)) if (/^content-security-policy/i.test(k)) delete headers[k];
      cb({ responseHeaders: headers });
    });
  }

  // Partage d'écran (Discord) : petit menu pour choisir l'écran ou la fenêtre
  ses.setDisplayMediaRequestHandler(async (_req, callback) => {
    let done = false;
    const finish = (streams) => { if (!done) { done = true; callback(streams); } };
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const items = sources.slice(0, 25).map((src) => ({
        label: (src.id.startsWith('screen') ? '🖥  ' : '🪟  ') + (src.name || 'Sans titre').slice(0, 60),
        click: () => {
          const streams = { video: src };
          if (process.platform === 'win32') streams.audio = 'loopback';
          finish(streams);
        },
      }));
      Menu.buildFromTemplate([
        { label: 'Que veux-tu partager ?', enabled: false },
        { type: 'separator' },
        ...items,
        { type: 'separator' },
        { label: 'Annuler', click: () => finish({}) },
      ]).popup({ window: win, callback: () => setTimeout(() => finish({}), 300) });
    } catch {
      finish({});
    }
  });
}

function registerAppProtocol(ses) {
  if (ses.protocol.isProtocolHandled('poseyhub')) return;
  ses.protocol.handle('poseyhub', (request) => {
    const { pathname } = new URL(request.url);
    // Images des jeux (jaquettes du cache Steam, logos Xbox) : seulement des fichiers trouvés par le scan
    if (pathname.startsWith('/media/')) {
      const media = games.mediaFile(decodeURIComponent(pathname.slice('/media/'.length)));
      return media ? net.fetch(pathToFileURL(media).toString()) : new Response('', { status: 404 });
    }
    // Images de l'appli (logo…)
    if (pathname.startsWith('/assets/')) {
      const file = path.normalize(path.join(ASSETS, decodeURIComponent(pathname.slice('/assets/'.length))));
      if (!file.startsWith(ASSETS + path.sep) || !/\.(png|svg|ico)$/i.test(file)) return new Response('Interdit', { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    }
    const file = path.normalize(path.join(__dirname, decodeURIComponent(pathname)));
    if (!file.startsWith(__dirname + path.sep) || !/\.(html|js|css|png|svg)$/i.test(file)) {
      return new Response('Interdit', { status: 403 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}

// ---------------------------------------------------------------------------
// Vues des services
// ---------------------------------------------------------------------------
function createView(service) {
  const ses = session.fromPartition('persist:' + service.id);
  setupSession(ses, service.id);
  if (service.local) registerAppProtocol(ses);

  const view = new WebContentsView({
    webPreferences: {
      session: ses, contextIsolation: true, sandbox: true, spellcheck: true,
      ...(service.preload ? { preload: path.join(__dirname, service.preload) } : {}),
      ...(service.local ? { autoplayPolicy: 'no-user-gesture-required' } : {}),
    },
  });
  view.setBackgroundColor(paletteFor(service.id).bg);
  view.setVisible(false);
  win.contentView.addChildView(view);

  const st = { view, badge: 0, loading: true, title: service.name };
  views[service.id] = st;
  const wc = view.webContents;
  wc.setAudioMuted(!!settings.muted[service.id]);

  if (service.local) {
    // Page interne : tout lien externe part dans le navigateur
    wc.on('will-navigate', (e, url) => {
      if (!url.startsWith('poseyhub://')) { e.preventDefault(); openExternal(url); }
    });
    wc.on('dom-ready', () => applyTheme(wc, paletteFor(service.id)));
  }

  wc.setWindowOpenHandler(({ url }) => {
    if (service.local) { openExternal(url); return { action: 'deny' }; }
    if (service.browser && /^https?:/i.test(url) && !hostMatches(url, LOGIN_HOSTS)) { wc.loadURL(url); return { action: 'deny' }; }
    if (!url || url === 'about:blank' || hostMatches(url, LOGIN_HOSTS)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          parent: win, width: 520, height: 720, autoHideMenuBar: true,
          backgroundColor: '#ffffff', icon: ICON,
        },
      };
    }
    if (hostMatches(url, service.domains)) wc.loadURL(url);   // même site → on reste dans l'onglet
    else openExternal(url);                                    // autre site → navigateur par défaut
    return { action: 'deny' };
  });

  // Vencord : son style, ajouté à chaque chargement de Discord
  if (service.id === 'discord') {
    wc.on('dom-ready', () => {
      const css = settings.vencord ? vencord.css() : null;
      if (css) wc.insertCSS(css).catch(() => {});
    });
  }

  wc.on('page-title-updated', (_e, title) => {
    st.title = title;
    const m = /^\((\d+)\+?\)/.exec(title);
    st.badge = m ? parseInt(m[1], 10) : (/^[•●]/.test(title) ? -1 : 0);
    sendState();
    updateUnread();
  });
  wc.on('did-start-loading', () => { st.loading = true; sendState(); });
  wc.on('did-stop-loading', () => { st.loading = false; sendState(); });
  wc.on('did-finish-load', () => applyZoom(wc));
  if (service.browser) {
    wc.on('did-navigate', () => sendState());
    wc.on('did-navigate-in-page', () => sendState());
  }
  wc.on('audio-state-changed', () => sendState());

  // Plein écran des vidéos (YouTube, Discord…)
  wc.on('enter-html-full-screen', () => { htmlFullscreen = true; win.setFullScreen(true); layout(); });
  wc.on('leave-html-full-screen', () => { htmlFullscreen = false; win.setFullScreen(false); layout(); });

  wc.on('before-input-event', handleShortcut);
  if (!service.page) wc.on('context-menu', (_e, params) => showContextMenu(wc, params));

  wc.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    if (isMainFrame && code !== -3 && !service.local) {   // -3 = navigation annulée (normal)
      wc.loadFile(path.join(__dirname, 'offline.html'), { query: { url: urlOf(service), name: service.name } });
    }
  });
  wc.on('render-process-gone', () => setTimeout(() => { if (!wc.isDestroyed()) wc.reload(); }, 1000));

  wc.loadURL(urlOf(service));
  layout();
  raiseOverlay();
  return st;
}

function destroyView(id) {
  const st = views[id];
  if (!st) return;
  try { win.contentView.removeChildView(st.view); } catch { /* ignore */ }
  try { st.view.webContents.close(); } catch { /* ignore */ }
  delete views[id];
}

function applyZoom(wc) {
  if (wc && !wc.isDestroyed()) wc.setZoomFactor(Math.min(2, Math.max(0.5, (settings.zoom || 100) / 100)));
}

function layout() {
  if (!win || win.isDestroyed()) return;
  const { width, height } = win.getContentBounds();
  const full = win.isFullScreen() && !htmlFullscreen; // F11 : on garde la carte mais sans marge
  for (const [id, st] of Object.entries(views)) {
    const fill = htmlFullscreen && id === activeId;
    if (fill) {
      st.view.setBounds({ x: 0, y: 0, width, height });
    } else {
      const g = full ? 0 : GAP;
      st.view.setBounds({
        x: SIDEBAR, y: TOPBAR,
        width: Math.max(0, width - SIDEBAR - g), height: Math.max(0, height - TOPBAR - g),
      });
    }
    if (typeof st.view.setBorderRadius === 'function') st.view.setBorderRadius(fill || full ? 0 : RADIUS);
  }
  if (overlay) overlay.setBounds({ x: 0, y: 0, width, height });
}

// ---------------------------------------------------------------------------
// Fenêtre de mise à jour (par-dessus tout, fond transparent)
// ---------------------------------------------------------------------------
let overlay = null;
let overlayMode = 'update';
let overlayOpen = false;
let remoteNotes = null;
const localNotes = (() => { try { return require('./nouveautes.json'); } catch { return null; } })();

async function fetchRemoteNotes() {
  try {
    const r = await fetch('https://raw.githubusercontent.com/Angelotkkt/PoseyHub/main/src/nouveautes.json?t=' + Date.now(), { signal: AbortSignal.timeout(6000) });
    if (r.ok) remoteNotes = await r.json();
  } catch { /* hors ligne : on garde les nouveautés connues */ }
}

function raiseOverlay() {
  if (!overlay || !overlayOpen) return;
  try { win.contentView.removeChildView(overlay); } catch { /* ignore */ }
  win.contentView.addChildView(overlay);
}

function showUpdateModal(mode = 'update') {
  if (!win || win.isDestroyed()) return;
  overlayMode = mode;
  if (mode !== 'updated') fetchRemoteNotes().then(() => pushUpdate());
  if (!overlay) {
    overlay = new WebContentsView({
      webPreferences: { preload: path.join(__dirname, 'updatePreload.js'), contextIsolation: true, sandbox: true },
    });
    overlay.setBackgroundColor('#00000000');
    overlay.webContents.on('dom-ready', () => applyTheme(overlay.webContents, theme()));
    overlay.webContents.on('before-input-event', (e, input) => {
      if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'i') overlay.webContents.openDevTools({ mode: 'detach' });
    });
    overlay.webContents.loadFile(path.join(__dirname, 'update.html'));
  } else {
    pushUpdate();
  }
  overlayOpen = true;
  overlay.setVisible(true);
  raiseOverlay();
  layout();
  if (!win.isVisible()) win.show();
  overlay.webContents.focus();
}

function hideUpdateModal() {
  if (!overlay) return;
  overlayOpen = false;
  overlay.setVisible(false);
  activeWc()?.focus();
}

function pushUpdate() {
  if (overlay && !overlay.webContents.isDestroyed()) overlay.webContents.send('upd:changed');
}

const fromOverlay = (e) => overlay && e.sender === overlay.webContents;
ipcMain.handle('upd:get', (e) => {
  if (!fromOverlay(e)) throw new Error('Accès refusé');
  return {
    mode: overlayMode,
    state: updater.state(),
    current: app.getVersion(),
    portable: updater.isPortable(),
    notes: overlayMode === 'updated' ? localNotes : (remoteNotes || null),
  };
});
ipcMain.on('upd:install', (e) => { if (fromOverlay(e)) updater.installNow(); });
ipcMain.on('upd:close', (e) => { if (fromOverlay(e)) hideUpdateModal(); });
ipcMain.on('upd:check', (e) => { if (fromOverlay(e)) { overlayMode = 'update'; updater.check(); } });
ipcMain.on('upd:site', (e) => { if (fromOverlay(e)) shell.openExternal(updater.SITE); });

// Réaction aux changements de l'outil de mise à jour
function onUpdaterChange(u) {
  sendState(); updateUnread(); pushSettings(); pushUpdate();
  // Nouvelle version téléchargée : on la propose une fois, quand la fenêtre est visible
  if (u.status === 'ready' && settings.updatePromptedFor !== u.version && win?.isVisible() && !win.isMinimized() && !htmlFullscreen) {
    settings.updatePromptedFor = u.version;
    saveSettings();
    if (!overlayOpen) showUpdateModal('update');
  }
}

function switchTo(id) {
  const service = pageById(id);
  if (!service || !win) return;
  if (!service.page && !settings.enabled[id]) return;
  if (htmlFullscreen && activeWc()) {
    activeWc().executeJavaScript('document.fullscreenElement && document.exitFullscreen()').catch(() => {});
  }
  if (!views[id]) createView(service);
  if (activeId !== id && activeId !== 'settings') previousId = activeId;
  activeId = id;
  if (settings.theme === 'auto') applyChromeTheme();
  if (!service.page) { settings.lastService = id; saveSettings(); }
  for (const [k, st] of Object.entries(views)) st.view.setVisible(k === id);
  layout();
  views[id].view.webContents.focus();
  sendState();
}

function toggleSettings() {
  if (activeId === 'settings') switchTo(previousId && settings.enabled[previousId] ? previousId : visibleServices()[0]?.id);
  else switchTo('settings');
}

function navigate(action) {
  const wc = activeWc();
  if (!wc) return;
  const h = wc.navigationHistory;
  switch (action) {
    case 'back': if (h.canGoBack()) h.goBack(); break;
    case 'forward': if (h.canGoForward()) h.goForward(); break;
    case 'reload': wc.reload(); break;
    case 'home': wc.loadURL(urlOf(pageById(activeId))); break;
  }
}

function setMuted(id, value) {
  settings.muted[id] = !!value;
  wcOf(id)?.setAudioMuted(!!value);
  saveSettings();
  sendState();
  pushSettings();
}

// ---------------------------------------------------------------------------
// Raccourcis clavier
//   Ctrl+1…9 : changer de service   Ctrl+Tab : service suivant   Ctrl+, : réglages
//   Ctrl+R / F5 : actualiser        Alt+← / Alt+→ : précédent / suivant
//   Ctrl+L / Ctrl+K : recherche     Ctrl+M : couper le son          F11 : plein écran            Ctrl+Shift+I : outils de dev
// ---------------------------------------------------------------------------
function handleShortcut(event, input) {
  if (input.type !== 'keyDown') return;
  const key = input.key;
  const list = visibleServices();
  let handled = true;
  if (input.control && !input.shift && /^[1-9]$/.test(key) && list[+key - 1]) switchTo(list[+key - 1].id);
  else if (input.control && key === 'Tab' && list.length) {
    const i = list.findIndex((s) => s.id === activeId);
    const next = (Math.max(0, i) + (input.shift ? list.length - 1 : 1)) % list.length;
    switchTo(list[next].id);
  }
  else if (input.control && (key === ',' || key === ';')) toggleSettings();
  else if (input.control && !input.shift && ['l', 'k'].includes(key.toLowerCase()) && settings.enabled.search) {
    switchTo('search');
    win.webContents.focus();
    win.webContents.send('focus-search');
  }
  else if (input.control && !input.shift && key.toLowerCase() === 'm' && activeId && activeId !== 'settings') setMuted(activeId, !settings.muted[activeId]);
  else if ((input.control && !input.shift && key.toLowerCase() === 'r') || key === 'F5') navigate('reload');
  else if (input.alt && key === 'ArrowLeft') navigate('back');
  else if (input.alt && key === 'ArrowRight') navigate('forward');
  else if (key === 'F11') win.setFullScreen(!win.isFullScreen());
  else if (input.control && input.shift && key.toLowerCase() === 'i') activeWc()?.openDevTools({ mode: 'detach' });
  else handled = false;
  if (handled) event.preventDefault();
}

// ---------------------------------------------------------------------------
// Menu clic droit (copier / coller / liens / orthographe)
// ---------------------------------------------------------------------------
function showContextMenu(wc, p) {
  const t = [];
  if (p.misspelledWord) {
    for (const s of p.dictionarySuggestions.slice(0, 5)) t.push({ label: s, click: () => wc.replaceMisspelling(s) });
    if (p.dictionarySuggestions.length) t.push({ type: 'separator' });
  }
  if (p.linkURL) {
    t.push({ label: 'Ouvrir le lien dans le navigateur', click: () => openExternal(p.linkURL) });
    t.push({ label: 'Copier le lien', click: () => clipboard.writeText(p.linkURL) });
    t.push({ type: 'separator' });
  }
  if (p.mediaType === 'image' && p.srcURL) {
    t.push({ label: "Copier l'image", click: () => wc.copyImageAt(p.x, p.y) });
    t.push({ label: "Copier l'adresse de l'image", click: () => clipboard.writeText(p.srcURL) });
    t.push({ type: 'separator' });
  }
  const f = p.editFlags;
  if (p.isEditable || p.selectionText) {
    if (p.isEditable) t.push({ label: 'Couper', role: 'cut', enabled: f.canCut });
    t.push({ label: 'Copier', role: 'copy', enabled: f.canCopy });
    if (p.isEditable) t.push({ label: 'Coller', role: 'paste', enabled: f.canPaste });
    t.push({ label: 'Tout sélectionner', role: 'selectAll' });
    t.push({ type: 'separator' });
  }
  t.push({ label: 'Précédent', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() });
  t.push({ label: 'Actualiser', click: () => wc.reload() });
  Menu.buildFromTemplate(t).popup({ window: win });
}

// ---------------------------------------------------------------------------
// Barre latérale et barre du haut
// ---------------------------------------------------------------------------
function buildState() {
  const u = updater.state();
  const services = visibleServices().map((s) => ({
    id: s.id, name: s.name, color: colorOf(s), group: s.group || 'main',
    badge: settings.badges ? (views[s.id]?.badge || 0) : 0,
    loading: !!views[s.id]?.loading,
    title: views[s.id]?.title || s.name,
    muted: !!settings.muted[s.id],
    audible: !!views[s.id]?.view.webContents.isCurrentlyAudible?.(),
  }));
  const page = pageById(activeId);
  return {
    active: activeId,
    services,
    page: page ? {
      id: page.id, name: page.name, color: colorOf(page), title: views[page.id]?.title || page.name,
      loading: !!views[page.id]?.loading, muted: !!settings.muted[page.id], isPage: !!page.page,
      browser: !!page.browser,
      url: page.browser ? (wcOf(page.id)?.getURL() || '') : '',
      engine: page.id === 'search' ? { id: engine().id, name: engine().name, color: engine().color } : null,
    } : null,
    ui: { showLabels: settings.showLabels, accentMode: settings.accentMode, accent: settings.accent },
    update: { status: u.status, version: u.version, percent: u.percent || 0 },
  };
}
function sendState() {
  if (win && !win.isDestroyed()) win.webContents.send('state', buildState());
}

ipcMain.on('switch', (_e, id) => (id === 'settings' ? toggleSettings() : switchTo(id)));
ipcMain.on('nav', (_e, action) => navigate(action));
ipcMain.on('menu', () => toggleSettings());
ipcMain.on('mute', (_e, id) => { if (pageById(id) && !pageById(id).page) setMuted(id, !settings.muted[id]); });
ipcMain.on('update-install', () => showUpdateModal('update'));
ipcMain.on('service-menu', (_e, id) => serviceMenu(id));
ipcMain.on('engine-menu', () => engineMenu());
ipcMain.on('search-go', (_e, text) => searchGo(text));

// Recherche ou adresse tapée dans la barre du haut
function searchGo(text) {
  text = String(text || '').trim();
  const s = SERVICES.find((x) => x.id === 'search');
  if (!text || !settings.enabled.search) return;
  let url;
  const isUrl = /^https?:\/\//i.test(text) || (!/\s/.test(text) && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(text));
  if (isUrl) url = normalizeUrl(text);
  else {
    const e = engine();
    url = e.search ? e.search.replace('%s', encodeURIComponent(text)) : e.home;
  }
  if (!url) return;
  if (!views.search) createView(s);
  switchTo('search');
  wcOf('search')?.loadURL(url);
}

function setEngine(id) { setSetting('searchEngine', id); }
function engineMenu() {
  const cur = engine().id;
  const items = ENGINES.map((e) => ({ label: `${e.name}  —  ${e.desc}`, type: 'radio', checked: cur === e.id, click: () => setEngine(e.id) }));
  if (settings.customEngine?.home) items.push({ label: `${settings.customEngine.name || 'Personnalisé'}  —  moteur personnalisé`, type: 'radio', checked: cur === 'custom', click: () => setEngine('custom') });
  Menu.buildFromTemplate([
    { label: 'Moteur de recherche', enabled: false },
    { type: 'separator' },
    ...items,
    { type: 'separator' },
    { label: 'Ajouter un moteur personnalisé…', click: () => { switchTo('settings'); wcOf('settings')?.executeJavaScript("location.hash='search'").catch(() => {}); } },
  ]).popup({ window: win });
}
ipcMain.handle('get-state', () => buildState());

function serviceMenu(id) {
  const s = SERVICES.find((x) => x.id === id);
  if (!s) return;
  Menu.buildFromTemplate([
    { label: s.name, enabled: false },
    { type: 'separator' },
    ...(id === 'search' ? [
      { label: 'Moteur de recherche', submenu: [
        ...ENGINES.map((e) => ({ label: e.name, type: 'radio', checked: engine().id === e.id, click: () => setEngine(e.id) })),
        ...(settings.customEngine?.home ? [{ label: settings.customEngine.name || 'Personnalisé', type: 'radio', checked: engine().id === 'custom', click: () => setEngine('custom') }] : []),
      ] },
      { type: 'separator' },
    ] : []),
    { label: 'Actualiser', click: () => wcOf(id)?.reload() },
    { label: settings.muted[id] ? 'Réactiver le son' : 'Couper le son', click: () => setMuted(id, !settings.muted[id]) },
    { label: 'Notifications Windows', type: 'checkbox', checked: !!settings.notifications[id], click: (m) => setSetting('notifications', m.checked, id) },
    { type: 'separator' },
    { label: 'Masquer de la barre', click: () => setSetting('enabled', false, id) },
    { label: 'Réglages…', click: () => switchTo('settings') },
  ]).popup({ window: win });
}

// ---------------------------------------------------------------------------
// Gaming Hub — seulement depuis la page Jeux de l'appli
// ---------------------------------------------------------------------------
const gHandle = (channel, fn) => ipcMain.handle(channel, (e, ...args) => {
  if (e.sender !== wcOf('games')) throw new Error('Accès refusé');
  return fn(...args);
});
gHandle('games:list', () => games.list());
gHandle('games:scan', () => games.scan().then(() => true));
gHandle('games:launch', async (id) => {
  try {
    const r = await games.launch(String(id));
    if (r.minimize && win && !win.isDestroyed()) setTimeout(() => win.minimize(), 600);
    return { ok: true, name: r.name };
  } catch (e) {
    return { ok: false, error: e.message || 'Impossible de lancer ce jeu.' };
  }
});
gHandle('games:favorite', (id) => games.toggleFavorite(String(id)));
gHandle('games:rename', (id, name) => games.rename(String(id), name));
gHandle('games:unhideAll', () => games.unhideAll());
gHandle('games:setMinimize', (v) => games.setMinimize(v));
gHandle('games:add', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Ajouter un jeu à Simply Hub',
    buttonLabel: 'Ajouter',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Jeux et raccourcis', extensions: ['exe', 'lnk', 'url', 'bat', 'cmd'] }],
  });
  return r.canceled ? 0 : games.addCustom(r.filePaths);
});
gHandle('games:menu', (id) => {
  id = String(id);
  const g = games.get(id);
  if (!g) return;
  games.list().then((l) => {
    const info = l.games.find((x) => x.id === id) || {};
    const folder = games.folderOf(id);
    const t = [
      { label: `Jouer à ${g.name}`, click: () => wcOf('games')?.executeJavaScript(`play(${JSON.stringify(id)})`).catch(() => {}) },
      { type: 'separator' },
      { label: info.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris', click: () => games.toggleFavorite(id) },
      { label: 'Ouvrir le dossier du jeu', enabled: !!folder, click: () => shell.openPath(folder) },
    ];
    if (g.custom) {
      t.push({ label: 'Renommer…', click: () => wcOf('games')?.send('games:renameRequest', id) });
      t.push({ type: 'separator' });
      t.push({ label: 'Retirer de Simply Hub', click: () => games.removeCustom(id) });
    } else {
      t.push({ type: 'separator' });
      t.push({ label: 'Masquer ce jeu', click: () => games.toggleHidden(id) });
    }
    Menu.buildFromTemplate(t).popup({ window: win });
  });
});
games.onChange(() => {
  const wc = wcOf('games');
  if (wc && !wc.isDestroyed()) wc.send('games:changed');
  pushSettings();
});

// ---------------------------------------------------------------------------
// Vencord
// ---------------------------------------------------------------------------
ipcMain.on('vencord:code', (e) => {
  e.returnValue = e.sender === wcOf('discord') && settings.vencord ? vencord.code() : null;
});
vencord.onChange(() => pushSettings());

async function vencordUpdate(force) {
  const changed = await vencord.update(force);
  if (changed && settings.vencord) wcOf('discord')?.reload();
  return changed;
}

// ---------------------------------------------------------------------------
// Page Réglages
// ---------------------------------------------------------------------------
const exePath = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
const loginItem = () => app.getLoginItemSettings({ path: exePath(), args: ['--hidden'] });

// Protection vidéo : Widevine (castLabs) + signature VMP, exigée par Netflix, Disney+, HBO Max, Prime Video
function drmStatus() {
  let widevine = false;
  try {
    const st = components && typeof components.status === 'function' ? components.status() : {};
    widevine = Object.values(st || {}).some((c) => c && (c.status === 'updated' || c.status === 'up-to-date' || c.version));
  } catch { /* ignore */ }
  const exe = process.execPath;
  const vmp = fs.existsSync(exe + '.sig') || fs.existsSync(path.join(path.dirname(exe), path.basename(exe) + '.sig'));
  return { widevine, vmp, packaged: app.isPackaged };
}

async function settingsSnapshot() {
  const gl = await games.list().catch(() => ({ games: [], scanning: false, minimizeOnLaunch: true }));
  return {
    app: {
      version: app.getVersion(),
      portable: !!process.env.PORTABLE_EXECUTABLE_FILE,
      packaged: app.isPackaged,
      dataDir: app.getPath('userData'),
      electron: process.versions.electron,
      site: updater.SITE,
    },
    drm: drmStatus(),
    search: {
      engine: engine().id,
      engines: ENGINES.map(({ id, name, color, desc, home }) => ({ id, name, color, desc, home })),
      custom: settings.customEngine,
    },
    settings: {
      closeToTray: settings.closeToTray, alwaysOnTop: settings.alwaysOnTop, startHidden: settings.startHidden,
      preloadAll: settings.preloadAll, theme: settings.theme, accentMode: settings.accentMode, accent: settings.accent,
      showLabels: settings.showLabels, badges: settings.badges, taskbarBadge: settings.taskbarBadge, searchEngine: settings.searchEngine,
      zoom: settings.zoom, vencord: settings.vencord,
    },
    login: loginItem().openAtLogin,
    themes: [
      { id: 'auto', name: 'Selon l’onglet', auto: true, swatches: SERVICES.map((sv) => ({ bg: (SERVICE_THEMES[sv.id] || THEMES.nuit).bg, c: sv.color })) },
      ...Object.entries(THEMES).map(([id, t]) => ({ id, ...t })),
    ],
    accents: ACCENTS,
    services: settings.order.map((id) => SERVICES.find((s) => s.id === id)).filter(Boolean).map((s) => ({
      id: s.id, name: s.name, color: colorOf(s),
      enabled: !!settings.enabled[s.id], notifications: !!settings.notifications[s.id], muted: !!settings.muted[s.id],
      loaded: !!views[s.id], local: !!s.local, group: s.group || 'main',
    })),
    update: updater.state(),
    games: {
      count: gl.games.filter((g) => !g.hidden).length,
      hidden: gl.games.filter((g) => g.hidden).length,
      scanning: gl.scanning, minimizeOnLaunch: gl.minimizeOnLaunch, lastScan: gl.lastScan || 0,
    },
    vencord: vencord.status(),
  };
}
let pushTimer = null;
function pushSettings() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const wc = wcOf('settings');
    if (wc && !wc.isDestroyed()) wc.send('cfg:changed');
  }, 80);
}

function setSetting(key, value, id) {
  switch (key) {
    case 'closeToTray': case 'startHidden': case 'preloadAll': case 'showLabels':
    case 'badges': case 'taskbarBadge':
      settings[key] = !!value; break;
    case 'alwaysOnTop':
      settings.alwaysOnTop = !!value; win?.setAlwaysOnTop(!!value); break;
    case 'theme':
      if (value !== 'auto' && !THEMES[value]) return;
      settings.theme = value; applyThemeEverywhere(); break;
    case 'accentMode':
      settings.accentMode = value === 'fixe' ? 'fixe' : 'service'; break;
    case 'accent':
      if (!/^#[0-9a-f]{6}$/i.test(String(value))) return;
      settings.accent = value; settings.accentMode = 'fixe'; break;
    case 'zoom':
      settings.zoom = Math.min(150, Math.max(70, Math.round(Number(value) / 10) * 10 || 100));
      for (const st of Object.values(views)) applyZoom(st.view.webContents);
      break;
    case 'login':
      app.setLoginItemSettings({ openAtLogin: !!value, path: exePath(), args: ['--hidden'] }); break;
    case 'vencord':
      settings.vencord = !!value;
      if (settings.vencord && !vencord.status().installed) vencordUpdate(true);
      else wcOf('discord')?.reload();
      break;
    case 'enabled': {
      if (!SERVICES.some((s) => s.id === id)) return;
      if (!value && visibleServices().length <= 1 && settings.enabled[id]) return; // garder au moins un service
      settings.enabled[id] = !!value;
      if (!value) {
        destroyView(id);
        if (activeId === id) switchTo(visibleServices()[0].id);
      } else if (settings.preloadAll && !views[id] && !SERVICES.find((s) => s.id === id).lazy) createView(SERVICES.find((s) => s.id === id));
      buildTray();
      break;
    }
    case 'notifications':
      if (!SERVICES.some((s) => s.id === id)) return;
      settings.notifications[id] = !!value; break;
    case 'muted':
      setMuted(id, value); return;
    case 'order':
      if (!Array.isArray(value)) return;
      settings.order = [...value.filter((x) => SERVICES.some((s) => s.id === x)), ...settings.order.filter((x) => !value.includes(x))];
      buildTray();
      break;
    case 'searchEngine': {
      if (value !== 'custom' && !ENGINES.some((e) => e.id === value)) return;
      if (value === 'custom' && !settings.customEngine?.home) return;
      settings.searchEngine = value;
      wcOf('search')?.loadURL(engine().home);
      applyThemeEverywhere();
      break;
    }
    case 'customEngine': {
      const home = normalizeUrl(value?.home);
      if (!home) return;
      const search = String(value?.search || '').includes('%s') ? normalizeUrl(String(value.search).replace('%s', 'POSEYQUERY'))?.replace('POSEYQUERY', '%s') : '';
      let name = String(value?.name || '').trim().slice(0, 30);
      if (!name) name = new URL(home).hostname.replace(/^www\./, '');
      settings.customEngine = { name, home, search: search || '' };
      settings.searchEngine = 'custom';
      wcOf('search')?.loadURL(home);
      applyThemeEverywhere();
      break;
    }
    case 'gamesMinimize':
      games.setMinimize(!!value); break;
    default:
      return;
  }
  saveSettings();
  sendState();
  updateUnread();
  pushSettings();
}

async function settingsAction(name, arg) {
  const s = SERVICES.find((x) => x.id === arg);
  switch (name) {
    case 'close': toggleSettings(); break;
    case 'open': if (s) switchTo(s.id); break;
    case 'reload': if (s) wcOf(s.id)?.reload(); break;
    case 'devtools': if (s) { if (!views[s.id]) createView(s); wcOf(s.id)?.openDevTools({ mode: 'detach' }); } break;
    case 'clearCache': if (s) { await session.fromPartition('persist:' + s.id).clearCache(); wcOf(s.id)?.reload(); return 'Cache vidé'; } break;
    case 'logout': if (s) return logout(s); break;
    case 'checkUpdate': showUpdateModal('update'); updater.check(); break;
    case 'installUpdate': updater.installNow(); break;
    case 'vencordUpdate': return (await vencordUpdate(true)) ? 'Vencord mis à jour' : (vencord.status().error ? null : 'Vencord est déjà à jour');
    case 'vencordSettings':
      switchTo('discord');
      wcOf('discord')?.executeJavaScript(
        'try{Vencord.Webpack.Common.SettingsRouter.open("VencordSettings");true}catch(e){false}'
      ).catch(() => {});
      break;
    case 'gamesScan': games.scan().catch(() => {}); break;
    case 'gamesUnhide': games.unhideAll(); break;
    case 'openData': shell.openPath(app.getPath('userData')); break;
    case 'openSite': shell.openExternal(updater.SITE); break;
    case 'openGitHub': shell.openExternal('https://github.com/Angelotkkt/PoseyHub'); break;
    case 'openVencord': shell.openExternal('https://vencord.dev/'); break;
    case 'resetSettings': {
      const { response } = await dialog.showMessageBox(win, {
        type: 'question', buttons: ['Réinitialiser', 'Annuler'], defaultId: 1, cancelId: 1, title: 'Simply Hub',
        message: 'Remettre tous les réglages par défaut ?', detail: 'Tes connexions, tes jeux et Spotify ne sont pas touchés.',
      });
      if (response !== 0) return null;
      const keep = { bounds: settings.bounds, maximized: settings.maximized, lastService: settings.lastService, trayHintShown: settings.trayHintShown };
      Object.assign(settings, JSON.parse(JSON.stringify(DEFAULTS)), keep);
      for (const sv of SERVICES) { wcOf(sv.id)?.setAudioMuted(false); if (!views[sv.id]) createView(sv); }
      win.setAlwaysOnTop(false);
      applyThemeEverywhere();
      for (const st of Object.values(views)) applyZoom(st.view.webContents);
      buildTray();
      saveSettings(); sendState(); pushSettings();
      return 'Réglages remis par défaut';
    }
    case 'quit': quitApp(); break;
    default: break;
  }
  return null;
}

const cfgHandle = (channel, fn) => ipcMain.handle(channel, (e, ...args) => {
  if (e.sender !== wcOf('settings')) throw new Error('Accès refusé');
  return fn(...args);
});
cfgHandle('cfg:get', () => settingsSnapshot());
cfgHandle('cfg:set', (key, value, id) => setSetting(String(key), value, id ? String(id) : undefined));
cfgHandle('cfg:action', (name, arg) => settingsAction(String(name), arg ? String(arg) : undefined));

async function logout(service) {
  const { response } = await dialog.showMessageBox(win, {
    type: 'question', buttons: ['Se déconnecter', 'Annuler'], defaultId: 1, cancelId: 1,
    title: 'Simply Hub', message: `Se déconnecter de ${service.name} ?`,
    detail: 'Les cookies et données de connexion de ce service seront effacés.',
  });
  if (response !== 0) return null;
  await session.fromPartition('persist:' + service.id).clearStorageData();
  wcOf(service.id)?.loadURL(urlOf(service));
  return `Déconnecté de ${service.name}`;
}

// ---------------------------------------------------------------------------
// Notifications non lues (icône de la barre des tâches + zone de notification)
// ---------------------------------------------------------------------------
let badgeImage = null;
function updateUnread() {
  if (!win) return;
  const parts = visibleServices().filter((s) => views[s.id]?.badge).map((s) => {
    const b = views[s.id].badge;
    return `${s.name} : ${b > 0 ? b : 'nouveau'}`;
  });
  if (process.platform === 'win32') {
    if (!badgeImage) badgeImage = nativeImage.createFromPath(path.join(ASSETS, 'badge.png'));
    const show = parts.length && settings.badges && settings.taskbarBadge;
    win.setOverlayIcon(show ? badgeImage : null, show ? 'Messages non lus' : '');
  }
  const u = updater.state();
  tray?.setToolTip(u.status === 'ready' ? `Simply Hub — mise à jour ${u.version} prête`
    : parts.length ? `Simply Hub\n${parts.join('\n')}` : 'Simply Hub');
}

// ---------------------------------------------------------------------------
// Zone de notification (tray)
// ---------------------------------------------------------------------------
function buildTray() {
  if (!tray) return;
  const list = visibleServices();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Afficher Simply Hub', click: showWindow },
    { type: 'separator' },
    ...list.map((s, i) => ({ label: `${s.name}\tCtrl+${i + 1}`, click: () => { showWindow(); switchTo(s.id); } })),
    ...(settings.enabled.spotify ? [
      { type: 'separator' },
      { label: 'Spotify : lecture / pause', click: () => spotifyButton('control-button-playpause') },
      { label: 'Spotify : titre suivant', click: () => spotifyButton('control-button-skip-forward') },
      { label: 'Spotify : titre précédent', click: () => spotifyButton('control-button-skip-back') },
    ] : []),
    { type: 'separator' },
    { label: 'Réglages', click: () => { showWindow(); switchTo('settings'); } },
    { label: 'Quitter Simply Hub', click: quitApp },
  ]));
}

// Clique sur un bouton du lecteur web officiel de Spotify (s'il est ouvert)
function spotifyButton(testId) {
  const wc = wcOf('spotify');
  if (!wc || wc.isDestroyed()) return;
  wc.executeJavaScript(`(() => { const b = document.querySelector('[data-testid="${testId}"]'); if (b) b.click(); })()`).catch(() => {});
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(ASSETS, 'tray.png')));
  tray.setToolTip('Simply Hub');
  buildTray();
  tray.on('click', () => (win.isVisible() && win.isFocused() ? win.hide() : showWindow()));
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function quitApp() {
  quitting = true;
  app.quit();
}

// ---------------------------------------------------------------------------
// Fenêtre principale
// ---------------------------------------------------------------------------
function boundsAreVisible(b) {
  if (!b) return false;
  return screen.getAllDisplays().some(({ workArea: a }) =>
    b.x < a.x + a.width - 50 && b.x + b.width > a.x + 50 && b.y >= a.y - 10 && b.y < a.y + a.height - 50);
}

function createWindow() {
  const b = boundsAreVisible(settings.bounds) ? settings.bounds : null;
  const t = theme();
  win = new BrowserWindow({
    width: b?.width || 1280,
    height: b?.height || 800,
    x: b?.x, y: b?.y,
    minWidth: 860, minHeight: 540,
    title: 'Simply Hub',
    icon: ICON,
    backgroundColor: t.bg,
    show: false,
    alwaysOnTop: settings.alwaysOnTop,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: t.bg, symbolColor: t.text, height: TOPBAR },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.on('before-input-event', handleShortcut);
  win.webContents.on('dom-ready', () => { themeKeys.delete(win.webContents.id); applyChromeTheme(); });

  win.once('ready-to-show', () => {
    if (settings.maximized) win.maximize();
    if (!(launchedAtLogin && settings.startHidden)) win.show();
  });

  const rememberBounds = () => {
    if (!win.isMaximized() && !win.isFullScreen() && !win.isMinimized()) settings.bounds = win.getNormalBounds();
    settings.maximized = win.isMaximized();
    saveSettings();
  };
  win.on('resize', () => { layout(); rememberBounds(); });
  win.on('move', rememberBounds);
  win.on('maximize', () => { layout(); rememberBounds(); });
  win.on('unmaximize', () => { layout(); rememberBounds(); });
  win.on('enter-full-screen', layout);
  win.on('leave-full-screen', () => { htmlFullscreen = false; layout(); });

  win.on('close', (e) => {
    if (!quitting && settings.closeToTray) {
      e.preventDefault();
      win.hide();
      if (!settings.trayHintShown && tray && process.platform === 'win32') {
        settings.trayHintShown = true;
        saveSettings();
        tray.displayBalloon({
          iconType: 'info', title: 'Simply Hub tourne toujours',
          content: 'Ta musique et tes notifications continuent. Clic droit sur l’icône pour quitter.',
        });
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(async () => {
    // Widevine (DRM) — indispensable pour la lecture sur Spotify
    if (components && typeof components.whenReady === 'function') {
      try {
        await components.whenReady();
        console.log('[Simply Hub] Composants DRM :', components.status());
      } catch (err) {
        console.warn('[Simply Hub] Widevine indisponible :', err);
      }
    } else {
      console.warn('[Simply Hub] Electron sans Widevine : Spotify ne pourra pas lire la musique.');
    }

    loadSettings();
    games.load(app.getPath('userData'));
    vencord.init(app.getPath('userData'));
    setTimeout(() => games.scan().catch(() => {}), 4000); // recherche des jeux installés en arrière-plan
    createWindow();
    createTray();
    updater.init({
      window: () => win,
      prepareQuit: () => { quitting = true; },
      changed: onUpdaterChange,
    });

    // Vencord : installation au premier lancement, puis vérification des nouveautés
    if (settings.vencord) {
      vencord.ensure().then((changed) => {
        if (changed && settings.vencord) wcOf('discord')?.reload();
      }).catch(() => {});
    }

    const list = visibleServices();
    // Après une mise à jour : afficher les nouveautés une fois
    if (app.isPackaged && settings.lastRunVersion && settings.lastRunVersion !== app.getVersion()) {
      setTimeout(() => { if (win?.isVisible()) showUpdateModal('updated'); }, 2500);
    }
    settings.lastRunVersion = app.getVersion();
    saveSettings();

    const first = list.some((s) => s.id === settings.lastService) ? settings.lastService : list[0].id;
    switchTo(first);

    // On charge les autres services en arrière-plan (notifications Discord, etc.)
    if (settings.preloadAll) {
      list.filter((s) => s.id !== first && !s.lazy).forEach((s, i) => {
        setTimeout(() => { if (!views[s.id] && settings.enabled[s.id]) { createView(s); sendState(); } }, 1500 * (i + 1));
      });
    }
  });

  app.on('before-quit', () => {
    quitting = true;
    clearTimeout(saveTimer);
    saveSettingsNow();
  });
  app.on('window-all-closed', () => app.quit());
}
