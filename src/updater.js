'use strict';
/*
 * Mises à jour automatiques, comme pour AMS :
 * GitHub fabrique le nouveau SimplyHub-Setup.exe et le met dans la publication « windows »
 * de https://github.com/Angelotkkt/PoseyHub. L'appli le voit, le télécharge en arrière-plan
 * et l'installe toute seule à la prochaine fermeture (pas besoin de désinstaller).
 * La version « portable » ne peut pas se remplacer elle-même : elle prévient juste qu'il y a du nouveau.
 */
const { app, dialog, Notification, shell } = require('electron');

const SITE = 'https://angelotkkt.github.io/PoseyHub/';
const FEED = 'https://github.com/Angelotkkt/PoseyHub/releases/download/windows';
const EVERY = 4 * 60 * 60 * 1000; // toutes les 4 heures

const state = { status: 'idle', version: null, error: null };
let autoUpdater = null;
let getWindow = () => null;
let onChange = () => {};
let manualCheck = false;
const isPortable = () => !!process.env.PORTABLE_EXECUTABLE_FILE;

function set(status, extra = {}) {
  Object.assign(state, { status, error: null }, extra);
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

function notify(title, body, onClick) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: true });
  if (onClick) n.on('click', onClick);
  n.show();
}

function info(message, detail) {
  const win = getWindow();
  const opts = { type: 'info', title: 'Simply Hub', message, detail, buttons: ['OK'] };
  return win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts);
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
      notify('Nouvelle version de Simply Hub', `La version ${version} est sortie. Clique pour la télécharger.`, () => shell.openExternal(SITE));
      if (manualCheck) {
        const win = getWindow();
        const { response } = await dialog.showMessageBox(win, {
          type: 'info', title: 'Simply Hub', buttons: ['Ouvrir le site', 'Plus tard'], defaultId: 0, cancelId: 1,
          message: `Simply Hub ${version} est disponible.`,
          detail: 'Tu utilises la version portable : télécharge la nouvelle version sur le site.',
        });
        if (response === 0) shell.openExternal(SITE);
      }
    } else {
      set('uptodate');
      if (manualCheck) info('Simply Hub est à jour.', `Version ${app.getVersion()}`);
    }
  } catch (e) {
    set('error', { error: e.message });
    if (manualCheck) info('Impossible de vérifier les mises à jour.', 'Vérifie ta connexion Internet.');
  }
  manualCheck = false;
}

// --- Version installée : mise à jour automatique (electron-updater) -------
function setupAutoUpdater() {
  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = console;

  autoUpdater.on('checking-for-update', () => set('checking'));
  autoUpdater.on('update-available', (i) => set('downloading', { version: i.version }));
  autoUpdater.on('download-progress', (p) => set('downloading', { percent: Math.round(p.percent || 0) }));
  autoUpdater.on('update-not-available', () => {
    set('uptodate');
    if (manualCheck) info('Simply Hub est à jour.', `Version ${app.getVersion()}`);
    manualCheck = false;
  });
  autoUpdater.on('update-downloaded', async (i) => {
    set('ready', { version: i.version });
    notify('Mise à jour de Simply Hub prête',
      `La version ${i.version} s'installera quand tu quitteras Simply Hub. Clique pour redémarrer maintenant.`,
      () => installNow());
    if (manualCheck) {
      const win = getWindow();
      const { response } = await dialog.showMessageBox(win, {
        type: 'info', title: 'Simply Hub', buttons: ['Redémarrer maintenant', 'Plus tard'], defaultId: 0, cancelId: 1,
        message: `Simply Hub ${i.version} est prêt à être installé.`,
      });
      if (response === 0) installNow();
    }
    manualCheck = false;
  });
  autoUpdater.on('error', (e) => {
    set('error', { error: e?.message || String(e) });
    if (manualCheck) info('Impossible de vérifier les mises à jour.', 'Vérifie ta connexion Internet, puis réessaie.');
    manualCheck = false;
  });
}

function check(manual = false) {
  manualCheck = manual;
  if (!app.isPackaged) {
    if (manual) info('Mises à jour', 'Les mises à jour automatiques marchent seulement dans la version installée (.exe).');
    manualCheck = false;
    return;
  }
  if (isPortable()) { checkPortable(); return; }
  if (state.status === 'ready' && manual) { installNow(); return; }
  autoUpdater.checkForUpdates().catch(() => {});
}

let beforeInstall = () => {};
function installNow() {
  if (!autoUpdater) return;
  beforeInstall();
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
}

function init({ window, changed, prepareQuit }) {
  getWindow = window || getWindow;
  onChange = changed || onChange;
  beforeInstall = prepareQuit || beforeInstall;
  if (!app.isPackaged) return;
  if (!isPortable()) setupAutoUpdater();
  setTimeout(() => check(false), 15 * 1000);
  setInterval(() => check(false), EVERY);
}

module.exports = { init, check, installNow, state: () => ({ ...state }), isPortable, SITE };
