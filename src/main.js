'use strict';
/*
 * Simply Hub — YouTube, Discord et Spotify dans une seule appli de bureau.
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

function updateMenuItem() {
  const u = updater.state();
  if (u.status === 'ready') return { label: `Redémarrer pour installer la version ${u.version}`, click: () => updater.installNow() };
  if (u.status === 'downloading') return { label: `Téléchargement de la mise à jour… ${u.percent ? u.percent + ' %' : ''}`, enabled: false };
  if (u.status === 'checking') return { label: 'Recherche de mises à jour…', enabled: false };
  return { label: 'Rechercher des mises à jour', click: () => updater.check(true) };
}

// Données de l'appli : l'ancien nom était « PoseyHub ». Si ce dossier existe déjà,
// on continue de l'utiliser pour garder les connexions, réglages et jeux.
{
  const appData = app.getPath('appData');
  const oldDir = path.join(appData, 'PoseyHub');
  const newDir = path.join(appData, 'Simply Hub');
  app.setPath('userData', !fs.existsSync(newDir) && fs.existsSync(oldDir) ? oldDir : newDir);
}

// Protocole interne poseyhub:// pour les pages de l'appli (lecteur Spotify)
protocol.registerSchemesAsPrivileged([{
  scheme: 'poseyhub',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const SIDEBAR = 72;   // largeur de la barre latérale (px)
const TOPBAR = 36;    // hauteur de la barre du haut (px)
const BG = '#0f0f14';
const ASSETS = path.join(__dirname, '..', 'assets');
const ICON = path.join(ASSETS, process.platform === 'win32' ? 'icon.ico' : 'icon.png');

const SERVICES = [
  {
    id: 'youtube', name: 'YouTube', color: '#ff3b3b',
    url: 'https://www.youtube.com/',
    domains: ['youtube.com', 'youtu.be', 'youtube-nocookie.com', 'ytimg.com', 'googlevideo.com'],
  },
  {
    id: 'discord', name: 'Discord', color: '#5865f2',
    url: 'https://discord.com/app',
    domains: ['discord.com', 'discord.gg', 'discordapp.com', 'discord.new', 'discordapp.net'],
  },
  {
    // Lecteur maison relié à ton compte par la connexion officielle Spotify (Web API)
    id: 'spotify', name: 'Spotify', color: '#1ed760',
    url: 'poseyhub://app/spotify.html',
    local: true,
    preload: 'spotifyPreload.js',
    domains: [],
  },
  {
    // Gaming Hub : tous les jeux installés sur le PC
    id: 'games', name: 'Jeux', color: '#ffb020',
    url: 'poseyhub://app/games.html',
    local: true,
    preload: 'gamesPreload.js',
    domains: [],
  },
];

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
const settings = {
  lastService: 'youtube',
  bounds: null,
  maximized: false,
  closeToTray: true,
  alwaysOnTop: false,
  trayHintShown: false,
};
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { Object.assign(settings, JSON.parse(fs.readFileSync(settingsFile(), 'utf8'))); } catch { /* première ouverture */ }
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
let htmlFullscreen = false;
let quitting = false;
const startHidden = process.argv.includes('--hidden');

const serviceById = (id) => SERVICES.find((s) => s.id === id);
const activeWc = () => (activeId && views[activeId] ? views[activeId].view.webContents : null);

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
// Sessions (une par service, connexion conservée entre les lancements)
// ---------------------------------------------------------------------------
const preparedSessions = new WeakSet();
function setupSession(ses) {
  if (preparedSessions.has(ses)) return;
  preparedSessions.add(ses);

  ses.setUserAgent(CHROME_UA);
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(ALLOWED_PERMISSIONS.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission));
  try { ses.setSpellCheckerLanguages(['fr', 'en-US']); } catch { /* géré par Windows */ }

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

// ---------------------------------------------------------------------------
// Vues des services
// ---------------------------------------------------------------------------
function registerAppProtocol(ses) {
  if (ses.protocol.isProtocolHandled('poseyhub')) return;
  ses.protocol.handle('poseyhub', (request) => {
    const { pathname } = new URL(request.url);
    // Images des jeux (jaquettes du cache Steam, logos Xbox) : seulement des fichiers trouvés par le scan
    if (pathname.startsWith('/media/')) {
      const media = games.mediaFile(decodeURIComponent(pathname.slice('/media/'.length)));
      return media ? net.fetch(pathToFileURL(media).toString()) : new Response('', { status: 404 });
    }
    const file = path.normalize(path.join(__dirname, decodeURIComponent(pathname)));
    if (!file.startsWith(__dirname + path.sep) || !/\.(html|js|css|png|svg)$/i.test(file)) {
      return new Response('Interdit', { status: 403 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}

function createView(service) {
  const ses = session.fromPartition('persist:' + service.id);
  setupSession(ses);
  if (service.local) registerAppProtocol(ses);

  const view = new WebContentsView({
    webPreferences: {
      session: ses, contextIsolation: true, sandbox: true, spellcheck: true,
      ...(service.preload ? { preload: path.join(__dirname, service.preload) } : {}),
      ...(service.local ? { autoplayPolicy: 'no-user-gesture-required' } : {}),
    },
  });
  view.setBackgroundColor(BG);
  view.setVisible(false);
  win.contentView.addChildView(view);

  const st = { view, badge: 0, loading: true, title: service.name };
  views[service.id] = st;
  const wc = view.webContents;

  // Liens qui veulent ouvrir une nouvelle fenêtre
  if (service.local) {
    // Page interne : tout lien externe part dans le navigateur
    wc.on('will-navigate', (e, url) => {
      if (!url.startsWith('poseyhub://')) { e.preventDefault(); openExternal(url); }
    });
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
    if (hostMatches(url, service.domains)) {
      wc.loadURL(url);              // même site → on reste dans l'onglet
    } else {
      openExternal(url);            // autre site → navigateur par défaut
    }
    return { action: 'deny' };
  });

  wc.on('page-title-updated', (_e, title) => {
    st.title = title;
    const m = /^\((\d+)\+?\)/.exec(title);
    st.badge = m ? parseInt(m[1], 10) : (/^[•●]/.test(title) ? -1 : 0);
    sendState();
    updateUnread();
  });
  wc.on('did-start-loading', () => { st.loading = true; sendState(); });
  wc.on('did-stop-loading', () => { st.loading = false; sendState(); });

  // Plein écran des vidéos (YouTube, Discord…)
  wc.on('enter-html-full-screen', () => { htmlFullscreen = true; win.setFullScreen(true); layout(); });
  wc.on('leave-html-full-screen', () => { htmlFullscreen = false; win.setFullScreen(false); layout(); });

  wc.on('before-input-event', handleShortcut);
  wc.on('context-menu', (_e, params) => showContextMenu(wc, params));

  wc.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    // -3 = navigation annulée (normal)
    if (isMainFrame && code !== -3 && !service.local) {
      wc.loadFile(path.join(__dirname, 'offline.html'), { query: { url: service.url, name: service.name } });
    }
  });

  wc.on('render-process-gone', () => setTimeout(() => wc.reload(), 1000));

  wc.loadURL(service.url);
  layout();
  return st;
}

function layout() {
  if (!win || win.isDestroyed()) return;
  const { width, height } = win.getContentBounds();
  for (const [id, st] of Object.entries(views)) {
    if (htmlFullscreen && id === activeId) {
      st.view.setBounds({ x: 0, y: 0, width, height });
    } else {
      st.view.setBounds({
        x: SIDEBAR, y: TOPBAR,
        width: Math.max(0, width - SIDEBAR), height: Math.max(0, height - TOPBAR),
      });
    }
  }
}

function switchTo(id) {
  const service = serviceById(id);
  if (!service || !win) return;
  if (htmlFullscreen && activeWc()) {
    activeWc().executeJavaScript('document.fullscreenElement && document.exitFullscreen()').catch(() => {});
  }
  if (!views[id]) createView(service);
  activeId = id;
  settings.lastService = id;
  saveSettings();
  for (const [k, st] of Object.entries(views)) st.view.setVisible(k === id);
  layout();
  views[id].view.webContents.focus();
  sendState();
}

function navigate(action) {
  const wc = activeWc();
  if (!wc) return;
  const h = wc.navigationHistory;
  switch (action) {
    case 'back': if (h.canGoBack()) h.goBack(); break;
    case 'forward': if (h.canGoForward()) h.goForward(); break;
    case 'reload': wc.reload(); break;
    case 'home': wc.loadURL(serviceById(activeId).url); break;
  }
}

// ---------------------------------------------------------------------------
// Raccourcis clavier
//   Ctrl+1/2/3 : changer de service   Ctrl+Tab : service suivant
//   Ctrl+R / F5 : actualiser          Alt+← / Alt+→ : précédent / suivant
//   F11 : plein écran                 Ctrl+Shift+I : outils de dev
// ---------------------------------------------------------------------------
function handleShortcut(event, input) {
  if (input.type !== 'keyDown') return;
  const key = input.key;
  let handled = true;
  if (input.control && !input.shift && /^[1-9]$/.test(key) && SERVICES[+key - 1]) switchTo(SERVICES[+key - 1].id);
  else if (input.control && key === 'Tab') {
    const i = SERVICES.findIndex((s) => s.id === activeId);
    const next = (i + (input.shift ? SERVICES.length - 1 : 1)) % SERVICES.length;
    switchTo(SERVICES[next].id);
  }
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
// Communication avec la barre latérale
// ---------------------------------------------------------------------------
function buildState() {
  return {
    active: activeId,
    services: SERVICES.map((s) => ({
      id: s.id, name: s.name, color: s.color,
      badge: views[s.id]?.badge || 0,
      loading: !!views[s.id]?.loading,
      title: views[s.id]?.title || s.name,
    })),
  };
}
function sendState() {
  if (win && !win.isDestroyed()) win.webContents.send('state', buildState());
}

ipcMain.on('switch', (_e, id) => switchTo(id));
ipcMain.on('nav', (_e, action) => navigate(action));
ipcMain.on('menu', () => showSettingsMenu());
ipcMain.handle('get-state', () => buildState());

// ---------------------------------------------------------------------------
// Spotify (connexion officielle) — seulement depuis la page Spotify de l'appli
// ---------------------------------------------------------------------------
const fromSpotify = (e) => e.sender === views.spotify?.view.webContents;
const spHandle = (channel, fn) => ipcMain.handle(channel, (e, ...args) => {
  if (!fromSpotify(e)) throw new Error('Accès refusé');
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
  const targets = {
    dashboard: 'https://developer.spotify.com/dashboard',
    app: 'spotify:',
  };
  if (targets[what]) shell.openExternal(targets[what]).catch(() => {
    if (what === 'app') shell.openExternal('https://www.spotify.com/download/');
  });
});
spotify.onChange((st) => {
  const wc = views.spotify?.view.webContents;
  if (wc && !wc.isDestroyed()) wc.send('sp:changed', st);
});

// ---------------------------------------------------------------------------
// Gaming Hub — seulement depuis la page Jeux de l'appli
// ---------------------------------------------------------------------------
const gamesWc = () => views.games?.view.webContents;
const gHandle = (channel, fn) => ipcMain.handle(channel, (e, ...args) => {
  if (e.sender !== gamesWc()) throw new Error('Accès refusé');
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
      { label: `Jouer à ${g.name}`, click: () => gamesWc()?.executeJavaScript(`play(${JSON.stringify(id)})`).catch(() => {}) },
      { type: 'separator' },
      { label: info.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris', click: () => games.toggleFavorite(id) },
      { label: 'Ouvrir le dossier du jeu', enabled: !!folder, click: () => shell.openPath(folder) },
    ];
    if (g.custom) {
      t.push({ label: 'Renommer…', click: () => gamesWc()?.send('games:renameRequest', id) });
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
  const wc = gamesWc();
  if (wc && !wc.isDestroyed()) wc.send('games:changed');
});

// ---------------------------------------------------------------------------
// Menu réglages (roue crantée)
// ---------------------------------------------------------------------------
const exePath = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;

function showSettingsMenu() {
  const service = serviceById(activeId);
  const login = app.getLoginItemSettings({ path: exePath(), args: ['--hidden'] });
  Menu.buildFromTemplate([
    {
      label: 'Garder ouvert dans la zone de notification à la fermeture',
      type: 'checkbox', checked: settings.closeToTray,
      click: (m) => { settings.closeToTray = m.checked; saveSettings(); },
    },
    {
      label: 'Toujours au premier plan',
      type: 'checkbox', checked: settings.alwaysOnTop,
      click: (m) => { settings.alwaysOnTop = m.checked; win.setAlwaysOnTop(m.checked); saveSettings(); },
    },
    {
      label: 'Lancer Simply Hub au démarrage de Windows',
      type: 'checkbox', checked: login.openAtLogin,
      click: (m) => app.setLoginItemSettings({ openAtLogin: m.checked, path: exePath(), args: ['--hidden'] }),
    },
    { type: 'separator' },
    { label: `Se déconnecter de ${service.name}…`, click: () => logout(service) },
    { label: `Outils de développement (${service.name})`, click: () => activeWc()?.openDevTools({ mode: 'detach' }) },
    { type: 'separator' },
    { label: `Simply Hub ${app.getVersion()} — par PoseyDevs`, enabled: false },
    updateMenuItem(),
    { label: 'Site de Simply Hub', click: () => shell.openExternal(updater.SITE) },
    { type: 'separator' },
    { label: 'Quitter Simply Hub', click: quitApp },
  ]).popup({ window: win, x: 8, y: win.getContentBounds().height - 8 });
}

async function logout(service) {
  const { response } = await dialog.showMessageBox(win, {
    type: 'question', buttons: ['Se déconnecter', 'Annuler'], defaultId: 1, cancelId: 1,
    title: 'Simply Hub', message: `Se déconnecter de ${service.name} ?`,
    detail: 'Les cookies et données de connexion de ce service seront effacés.',
  });
  if (response !== 0) return;
  if (service.id === 'spotify') spotify.logout();
  await session.fromPartition('persist:' + service.id).clearStorageData();
  views[service.id]?.view.webContents.loadURL(service.url);
}

// ---------------------------------------------------------------------------
// Notifications non lues (icône de la barre des tâches + zone de notification)
// ---------------------------------------------------------------------------
let badgeImage = null;
function updateUnread() {
  if (!win) return;
  const parts = SERVICES.filter((s) => views[s.id]?.badge).map((s) => {
    const b = views[s.id].badge;
    return `${s.name} : ${b > 0 ? b : 'nouveau'}`;
  });
  if (process.platform === 'win32') {
    if (!badgeImage) badgeImage = nativeImage.createFromPath(path.join(ASSETS, 'badge.png'));
    win.setOverlayIcon(parts.length ? badgeImage : null, parts.length ? 'Messages non lus' : '');
  }
  tray?.setToolTip(parts.length ? `Simply Hub\n${parts.join('\n')}` : 'Simply Hub');
}

// ---------------------------------------------------------------------------
// Zone de notification (tray)
// ---------------------------------------------------------------------------
function spotifyCommand(action) {
  spotify.control(action).catch(() => {});
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(ASSETS, 'tray.png')));
  tray.setToolTip('Simply Hub');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Afficher Simply Hub', click: showWindow },
    { type: 'separator' },
    ...SERVICES.map((s, i) => ({ label: `${s.name}\tCtrl+${i + 1}`, click: () => { showWindow(); switchTo(s.id); } })),
    { type: 'separator' },
    { label: 'Spotify : lecture / pause', click: () => spotifyCommand('playpause') },
    { label: 'Spotify : titre suivant', click: () => spotifyCommand('next') },
    { label: 'Spotify : titre précédent', click: () => spotifyCommand('previous') },
    { type: 'separator' },
    { label: 'Quitter Simply Hub', click: quitApp },
  ]));
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
  win = new BrowserWindow({
    width: b?.width || 1280,
    height: b?.height || 800,
    x: b?.x, y: b?.y,
    minWidth: 820, minHeight: 520,
    title: 'Simply Hub',
    icon: ICON,
    backgroundColor: BG,
    show: false,
    alwaysOnTop: settings.alwaysOnTop,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: BG, symbolColor: '#e8e8f0', height: TOPBAR },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.on('before-input-event', handleShortcut);

  win.once('ready-to-show', () => {
    if (settings.maximized) win.maximize();
    if (!startHidden) win.show();
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
    setTimeout(() => games.scan().catch(() => {}), 4000); // recherche des jeux installés en arrière-plan
    createWindow();
    createTray();
    updater.init({
      window: () => win,
      prepareQuit: () => { quitting = true; },
      changed: (u) => {
        if (u.status === 'ready') tray?.setToolTip(`Simply Hub — mise à jour ${u.version} prête`);
      },
    });

    const first = serviceById(settings.lastService) ? settings.lastService : SERVICES[0].id;
    switchTo(first);

    // On charge les autres services en arrière-plan (notifications Discord, etc.)
    SERVICES.filter((s) => s.id !== first).forEach((s, i) => {
      setTimeout(() => { if (!views[s.id]) { createView(s); sendState(); } }, 1500 * (i + 1));
    });
  });

  app.on('before-quit', () => {
    quitting = true;
    clearTimeout(saveTimer);
    saveSettingsNow();
  });
  app.on('window-all-closed', () => app.quit());
}
