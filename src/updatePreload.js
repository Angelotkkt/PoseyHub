'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('upd', {
  get: () => ipcRenderer.invoke('upd:get'),
  install: () => ipcRenderer.send('upd:install'),
  later: () => ipcRenderer.send('upd:close'),
  check: () => ipcRenderer.send('upd:check'),
  site: () => ipcRenderer.send('upd:site'),
  onChanged: (cb) => ipcRenderer.on('upd:changed', () => cb()),
});
