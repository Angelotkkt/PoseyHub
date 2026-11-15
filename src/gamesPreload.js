'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hubGames', {
  list: () => ipcRenderer.invoke('games:list'),
  scan: () => ipcRenderer.invoke('games:scan'),
  launch: (id) => ipcRenderer.invoke('games:launch', id),
  favorite: (id) => ipcRenderer.invoke('games:favorite', id),
  menu: (id) => ipcRenderer.invoke('games:menu', id),
  add: () => ipcRenderer.invoke('games:add'),
  rename: (id, name) => ipcRenderer.invoke('games:rename', id, name),
  unhideAll: () => ipcRenderer.invoke('games:unhideAll'),
  setMinimize: (v) => ipcRenderer.invoke('games:setMinimize', v),
  onChanged: (cb) => ipcRenderer.on('games:changed', () => cb()),
  onRenameRequest: (cb) => ipcRenderer.on('games:renameRequest', (_e, id) => cb(id)),
});
