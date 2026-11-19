'use strict';
/*
 * Mises à jour automatiques, comme pour AMS :
 * GitHub fabrique le nouveau SimplyHub-Setup.exe et le met dans la publication « windows »
 * de https://github.com/Angelotkkt/PoseyHub. L'appli le voit, le télécharge en arrière-plan
 * et l'installe toute seule à la prochaine fermeture (pas besoin de désinstaller).
 * La version « portable » ne peut pas se remplacer elle-même : elle prévient juste qu'il y a du nouveau.
 *
 * Ce module ne montre aucune boîte Windows : il publie son état, et Simply Hub l'affiche
 * dans sa propre fenêtre de mise à jour (update.html).
 */
const { app, Notification, shell } = require('electron');

const SITE = 'https://angelotkkt.github.io/PoseyHub/';
const FEED = 'https://github.com/Angelotkkt/PoseyHub/releases/download/windows';
const EVERY = 4 * 60 * 60 * 1000; // toutes les 4 heures

// status : idle | checking | downloading | ready | uptodate | available (portable) | error | dev
const state = { status: 'idle', version: null, percent: 0, error: null, checkedAt: 0 };
let autoUpdater = null;
let getWindow = () => null;
let onChange = () => {};
let beforeInstall = () => {};
const isPortable = () => !!process.env.PORTABLE_EXECUTABLE_FILE;

function set(status, extra = {}) {
  Object.assign(state, { status, error: null }, extra);
  if (['uptodate', 'ready', 'available', 'error'].includes(status)) state.checkedAt = Date.now();
  onChange({ ...state });
}

function newer(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

// Notification Windows seulement si la fenêtre n'est pas visible (sinon la fenêtre de mise à jour s'en charge)
function notifyIfHidden(title, body, onClick) {
  const win = getWindow();
  if (win && win.isVisible() && !win.isMinimized()) return;
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: true });
  if (onClick) n.on('click', onClick);
  n.show();
}

// --- Version portable : simple vérification -------------------------------
async function checkPortable() {
  set('checking');
  try {
    const r = await fetch(`${FEED}/latest.yml`, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const version = (/^version:\s*['"]?([^\s'"]+)/m.exec(await r.text()) || [])[1];
    if (version && newer(version, app.getVersion())) {
      set('available', { version });
      notifyIfHidden('Nouvelle version de Simply Hub', `La version ${version} est sortie. Clique pour la télécharger.`, () => shell.openExternal(SITE));
    } else {
      set('uptodate');
    }
  } catch (e) {
    set('error', { error: e.message });
  }
}

// --- Version installée : mise à jour automatique (electron-updater) -------
function setupAutoUpdater() {
  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = console;

  autoUpdater.on('checking-for-update', () => { if (state.status !== 'ready') set('checking'); });
  autoUpdater.on('update-available', (i) => set('downloading', { version: i.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => set('downloading', { percent: Math.round(p.percent || 0) }));
  autoUpdater.on('update-not-available', () => set('uptodate'));
  autoUpdater.on('update-downloaded', (i) => {
    set('ready', { version: i.version, percent: 100 });
    notifyIfHidden('Mise à jour de Simply Hub prête',
      `La version ${i.version} s'installera quand tu quitteras Simply Hub. Clique pour redémarrer maintenant.`,
      () => installNow());
  });
  autoUpdater.on('error', (e) => {
    if (state.status === 'ready') return; // déjà téléchargée : on garde la version prête
    set('error', { error: e?.message || String(e) });
  });
}

function check() {
  if (!app.isPackaged) { set('dev'); return; }
  if (isPortable()) { checkPortable(); return; }
  if (state.status === 'ready' || state.status === 'downloading') { onChange({ ...state }); return; }
  set('checking');
  autoUpdater.checkForUpdates().catch((e) => set('error', { error: e?.message || String(e) }));
}

function installNow() {
  if (!autoUpdater || state.status !== 'ready') return;
  beforeInstall();
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
}

function init({ window, changed, prepareQuit }) {
  getWindow = window || getWindow;
  onChange = changed || onChange;
  beforeInstall = prepareQuit || beforeInstall;
  if (!app.isPackaged) return;
  if (!isPortable()) setupAutoUpdater();
  setTimeout(() => check(), 15 * 1000);
  setInterval(() => check(), EVERY);
}

module.exports = { init, check, installNow, state: () => ({ ...state }), isPortable, SITE };
