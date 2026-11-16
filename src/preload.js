'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hub', {
  switchTo: (id) => ipcRenderer.send('switch', id),
  nav: (action) => ipcRenderer.send('nav', action),
  openMenu: () => ipcRenderer.send('menu'),
  mute: (id) => ipcRenderer.send('mute', id),
  serviceMenu: (id) => ipcRenderer.send('service-menu', id),
  installUpdate: () => ipcRenderer.send('update-install'),
  getState: () => ipcRenderer.invoke('get-state'),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
});
