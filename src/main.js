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
const spotify = require('./spotify');
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
const TOPBAR = 40;    // hauteur de la barre du haut (px)
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
    // Lecteur maison relié à ton compte par la connexion officielle Spotify (Web API)
    id: 'spotify', name: 'Spotify', color: '#1fdc6a',
    url: 'poseyhub://app/spotify.html',
    local: true, preload: 'spotifyPreload.js', domains: [],
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
  startHidden: true,          // au démarrage de Windows : rester dans la zone de notification
  preloadAll: true,           // charger tous les services au lancement
  theme: 'nuit',
  accentMode: 'service',      // 'service' (couleur du service ouvert) ou 'fixe'
  accent: '#5b6cff',
  showLabels: true,
  badges: true,
  taskbarBadge: true,
  zoom: 100,
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
  if (!THEMES[settings.theme]) settings.theme = 'nuit';
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
const theme = () => THEMES[settings.theme] || THEMES.nuit;

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
function themeCss() {
  const t = theme();
  return `:root{--bg:${t.bg}!important;--deep:${t.deep}!important;--panel:${t.panel}!important;--panel2:${t.panel2}!important;`
    + `--hover:${t.hover}!important;--line:${t.line}!important;--text:${t.text}!important;--muted:${t.muted}!important;}`
    + `html,body{background:${t.bg}!important;}`;
}
const themeKeys = new Map();
async function applyTheme(wc) {
  if (!wc || wc.isDestroyed()) return;
  const old = themeKeys.get(wc.id);
  if (old) await wc.removeInsertedCSS(old).catch(() => {});
  try { themeKeys.set(wc.id, await wc.insertCSS(themeCss())); } catch { /* page en cours de chargement */ }
}
function applyThemeEverywhere() {
  const t = theme();
  if (win && !win.isDestroyed()) {
    win.setBackgroundColor(t.bg);
    try { win.setTitleBarOverlay({ color: t.bg, symbolColor: t.text, height: TOPBAR }); } catch { /* ignore */ }
    applyTheme(win.webContents);
  }
  for (const [id, st] of Object.entries(views)) {
    st.view.setBackgroundColor(t.bg);
    if (pageById(id)?.local) applyTheme(st.view.webContents);
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
  view.setBackgroundColor(theme().bg);
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
    wc.on('dom-ready', () => applyTheme(wc));
  }

  wc.setWindowOpenHandler(({ url }) => {
    if (service.local) { openExternal(url); return { action: 'deny' }; }
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
  wc.on('audio-state-changed', () => sendState());

  // Plein écran des vidéos (YouTube, Discord…)
  wc.on('enter-html-full-screen', () => { htmlFullscreen = true; win.setFullScreen(true); layout(); });
  wc.on('leave-html-full-screen', () => { htmlFullscreen = false; win.setFullScreen(false); layout(); });

  wc.on('before-input-event', handleShortcut);
  if (!service.page) wc.on('context-menu', (_e, params) => showContextMenu(wc, params));

  wc.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    if (isMainFrame && code !== -3 && !service.local) {   // -3 = navigation annulée (normal)
      wc.loadFile(path.join(__dirname, 'offline.html'), { query: { url: service.url, name: service.name } });
    }
  });
  wc.on('render-process-gone', () => setTimeout(() => { if (!wc.isDestroyed()) wc.reload(); }, 1000));

  wc.loadURL(service.url);
  layout();
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
  for (const [id, st] of Object.entries(views)) {
    if (htmlFullscreen && id === activeId) {
      st.view.setBounds({ x: 0, y: 0, width, height });
    } else {
      st.view.setBounds({ x: SIDEBAR, y: TOPBAR, width: Math.max(0, width - SIDEBAR), height: Math.max(0, height - TOPBAR) });
    }
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
    case 'home': wc.loadURL(pageById(activeId).url); break;
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
//   Ctrl+M : couper le son          F11 : plein écran            Ctrl+Shift+I : outils de dev
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
    id: s.id, name: s.name, color: s.color, group: s.group || 'main',
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
    page: page ? { id: page.id, name: page.name, color: page.color, title: views[page.id]?.title || page.name, loading: !!views[page.id]?.loading, muted: !!settings.muted[page.id], isPage: !!page.page } : null,
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
ipcMain.on('update-install', () => updater.installNow());
ipcMain.on('service-menu', (_e, id) => serviceMenu(id));
ipcMain.handle('get-state', () => buildState());

function serviceMenu(id) {
  const s = SERVICES.find((x) => x.id === id);
  if (!s) return;
  Menu.buildFromTemplate([
    { label: s.name, enabled: false },
    { type: 'separator' },
    { label: 'Actualiser', click: () => wcOf(id)?.reload() },
    { label: settings.muted[id] ? 'Réactiver le son' : 'Couper le son', click: () => setMuted(id, !settings.muted[id]) },
    { label: 'Notifications Windows', type: 'checkbox', checked: !!settings.notifications[id], click: (m) => setSetting('notifications', m.checked, id) },
    { type: 'separator' },
    { label: 'Masquer de la barre', click: () => setSetting('enabled', false, id) },
    { label: 'Réglages…', click: () => switchTo('settings') },
  ]).popup({ window: win });
}

// ---------------------------------------------------------------------------
// Spotify (connexion officielle) — seulement depuis la page Spotify de l'appli
// ---------------------------------------------------------------------------
const spHandle = (channel, fn) => ipcMain.handle(channel, (e, ...args) => {
  if (e.sender !== wcOf('spotify')) throw new Error('Accès refusé');
  return fn(...args);
});
spHandle('sp:status', () => spotify.status());
spHandle('sp:setClientId', (id) => spotify.setClientId(id));
spHandle('sp:login', async () => {
  try {
    const st = await spotify.login();
    showWindow();
    switchTo('spotify');
    return { ok: true, status: st };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
spHandle('sp:logout', () => spotify.logout());
spHandle('sp:reset', () => spotify.resetAll());
spHandle('sp:api', (method, p, opts) => spotify.api(method, p, opts));
spHandle('sp:token', async () => { try { return await spotify.getToken(); } catch { return null; } });
spHandle('sp:open', (what) => {
  const targets = { dashboard: 'https://developer.spotify.com/dashboard', app: 'spotify:' };
  if (targets[what]) shell.openExternal(targets[what]).catch(() => {
    if (what === 'app') shell.openExternal('https://www.spotify.com/download/');
  });
});
spotify.onChange((st) => {
  const wc = wcOf('spotify');
  if (wc && !wc.isDestroyed()) wc.send('sp:changed', st);
  pushSettings();
});

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
    settings: {
      closeToTray: settings.closeToTray, alwaysOnTop: settings.alwaysOnTop, startHidden: settings.startHidden,
      preloadAll: settings.preloadAll, theme: settings.theme, accentMode: settings.accentMode, accent: settings.accent,
      showLabels: settings.showLabels, badges: settings.badges, taskbarBadge: settings.taskbarBadge,
      zoom: settings.zoom, vencord: settings.vencord,
    },
    login: loginItem().openAtLogin,
    themes: Object.entries(THEMES).map(([id, t]) => ({ id, ...t })),
    accents: ACCENTS,
    services: settings.order.map((id) => SERVICES.find((s) => s.id === id)).filter(Boolean).map((s) => ({
      id: s.id, name: s.name, color: s.color,
      enabled: !!settings.enabled[s.id], notifications: !!settings.notifications[s.id], muted: !!settings.muted[s.id],
      loaded: !!views[s.id], local: !!s.local, group: s.group || 'main',
    })),
    update: updater.state(),
    spotify: spotify.status(),
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
      if (!THEMES[value]) return;
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
    case 'checkUpdate': updater.check(true); break;
    case 'installUpdate': updater.installNow(); break;
    case 'vencordUpdate': return (await vencordUpdate(true)) ? 'Vencord mis à jour' : (vencord.status().error ? null : 'Vencord est déjà à jour');
    case 'vencordSettings':
      switchTo('discord');
      wcOf('discord')?.executeJavaScript(
        'try{Vencord.Webpack.Common.SettingsRouter.open("VencordSettings");true}catch(e){false}'
      ).catch(() => {});
      break;
    case 'spotifyReset': spotify.resetAll(); switchTo('spotify'); break;
    case 'spotifyLogout': spotify.logout(); break;
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
  if (service.id === 'spotify') spotify.logout();
  await session.fromPartition('persist:' + service.id).clearStorageData();
  wcOf(service.id)?.loadURL(service.url);
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
      { label: 'Spotify : lecture / pause', click: () => spotify.control('playpause').catch(() => {}) },
      { label: 'Spotify : titre suivant', click: () => spotify.control('next').catch(() => {}) },
      { label: 'Spotify : titre précédent', click: () => spotify.control('previous').catch(() => {}) },
    ] : []),
    { type: 'separator' },
    { label: 'Réglages', click: () => { showWindow(); switchTo('settings'); } },
    { label: 'Quitter Simply Hub', click: quitApp },
  ]));
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
  win.webContents.on('dom-ready', () => applyTheme(win.webContents));

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
    spotify.init();
    games.load(app.getPath('userData'));
    vencord.init(app.getPath('userData'));
    setTimeout(() => games.scan().catch(() => {}), 4000); // recherche des jeux installés en arrière-plan
    createWindow();
    createTray();
    updater.init({
      window: () => win,
      prepareQuit: () => { quitting = true; },
      changed: () => { sendState(); updateUnread(); pushSettings(); },
    });

    // Vencord : installation au premier lancement, puis vérification des nouveautés
    if (settings.vencord) {
      vencord.ensure().then((changed) => {
        if (changed && settings.vencord) wcOf('discord')?.reload();
      }).catch(() => {});
    }

    const list = visibleServices();
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
