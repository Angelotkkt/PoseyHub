'use strict';
// Injecte Vencord dans Discord avant que la page ne démarre (même principe que l'extension de navigateur).
const { ipcRenderer, webFrame } = require('electron');

try {
  const vencord = ipcRenderer.sendSync('vencord:code');
  if (vencord && vencord.js) {
    webFrame
      .executeJavaScript(vencord.js + '\n//# sourceURL=vencord-browser.js')
      .catch((e) => console.error('[Simply Hub] Vencord n’a pas pu démarrer :', e));
  }
} catch (e) {
  console.error('[Simply Hub] Vencord :', e);
}
