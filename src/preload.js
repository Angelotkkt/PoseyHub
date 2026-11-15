'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hub', {
  switchTo: (id) => ipcRenderer.send('switch', id),
  nav: (action) => ipcRenderer.send('nav', action),
  openMenu: () => ipcRenderer.send('menu'),
  getState: () => ipcRenderer.invoke('get-state'),
  onState: (cb) => ipcRenderer.on('state', (_e, state) => cb(state)),
});
