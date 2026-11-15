'use strict';
/*
 * Gaming Hub : trouve les jeux installés sur le PC et les lance.
 *
 * Sources lues (rien n'est envoyé sur Internet) :
 *  - Steam      : bibliothèques, appmanifest_*.acf, jaquettes du cache local, temps de jeu
 *  - Epic Games : C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\*.item
 *  - Riot       : C:\ProgramData\Riot Games (VALORANT, League of Legends…)
 *  - Xbox / Game Pass / Microsoft Store : paquets qui contiennent MicrosoftGame.config
 *  - GOG, Ubisoft Connect : registre Windows
 *  - Battle.net, EA, Rockstar et autres éditeurs : liste « Applications installées » de Windows
 *  - HoYoverse (Genshin, Star Rail, ZZZ), Roblox, Minecraft : emplacements habituels
 *  - Jeux ajoutés à la main (.exe, raccourci .lnk ou .url)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');

let electron = null;
const E = () => electron || (electron = require('electron'));

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------
const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };
const read = (p) => fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
const norm = (p) => String(p || '').replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
const hash = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 12);

function ci(o, key) {
  if (!o || typeof o !== 'object') return undefined;
  if (key in o) return o[key];
  const lk = key.toLowerCase();
  for (const k of Object.keys(o)) if (k.toLowerCase() === lk) return o[k];
  return undefined;
}

function cleanPath(p) {
  if (!p) return null;
  let s = String(p).trim();
  const q = /^"([^"]+)"/.exec(s);
  if (q) s = q[1];
  s = s.replace(/,\s*-?\d+$/, '').trim(); // « jeu.exe,0 » (index d'icône)
  return s || null;
}

// Format VDF de Valve (Steam)
function parseVdf(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      let s = '';
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < text.length) {
          const n = text[i + 1];
          s += n === 'n' ? '\n' : n === 't' ? '\t' : n;
          i += 2;
        } else s += text[i++];
      }
      i++;
      tokens.push({ s });
    } else if (c === '{' || c === '}') { tokens.push(c); i++; }
    else if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; }
    else i++;
  }
  let p = 0;
  function obj() {
    const o = {};
    while (p < tokens.length) {
      const t = tokens[p++];
      if (t === '}') return o;
      if (typeof t !== 'object') continue;
      const next = tokens[p];
      if (next === '{') { p++; o[t.s] = obj(); }
      else if (next && typeof next === 'object') { p++; o[t.s] = next.s; }
    }
    return o;
  }
  return obj();
}

const SKIP_EXE = /unins|uninstall|setup|install|crash|report|redist|vc_?redist|dxsetup|helper|updater|launcherpatcher|easyanticheat|battleye|ue4prereq|dotnet|vcredist|cefprocess|webhelper/i;
function findMainExe(dir) {
  try {
    let best = null;
    let bestSize = 0;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isFile() || !/\.exe$/i.test(e.name) || SKIP_EXE.test(e.name)) continue;
      const full = path.join(dir, e.name);
      const size = fs.statSync(full).size;
      if (size > bestSize) { best = full; bestSize = size; }
    }
    return best;
  } catch { return null; }
}
function firstExisting(base, candidates) {
  for (const c of candidates || []) {
    const f = path.join(base, c);
    if (exists(f)) return f;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Steam
// ---------------------------------------------------------------------------
const STEAM_SKIP_IDS = new Set(['228980', '1070560', '1391110', '1628350', '1493710', '250820', '1161040', '1826330', '2180100', '3658110']);
const SKIP_NAME = /Proton|Steam Linux Runtime|Steamworks|Redistributable|SteamVR|Dedicated Server|\bSDK\b|Soundtrack|Wallpaper Engine.*Editor/i;

function steamCover(steamPath, appid) {
  const base = path.join(steamPath, 'appcache', 'librarycache');
  const dir = path.join(base, appid);
  const pick = (names) => {
    for (const n of names) {
      for (const f of [path.join(base, `${appid}_${n}`), path.join(dir, n)]) if (exists(f)) return f;
    }
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        for (const n of names) { const f = path.join(dir, e.name, n); if (exists(f)) return f; }
      }
    } catch { /* pas de dossier */ }
    return null;
  };
  const portrait = pick(['library_600x900.jpg', 'library_600x900_2x.jpg']);
  if (portrait) return { file: portrait, portrait: true };
  const header = pick(['header.jpg', 'library_header.jpg']);
  if (header) return { file: header, portrait: false };
  return null;
}

function steamPlayStats(steamPath) {
  const res = {};
  const ud = path.join(steamPath, 'userdata');
  let best = null;
  let bestT = 0;
  try {
    for (const u of fs.readdirSync(ud)) {
      const f = path.join(ud, u, 'config', 'localconfig.vdf');
      try { const t = fs.statSync(f).mtimeMs; if (t > bestT) { bestT = t; best = f; } } catch { /* ignore */ }
    }
  } catch { return res; }
  if (!best) return res;
  try {
    const v = parseVdf(read(best));
    const apps = ci(ci(ci(ci(ci(v, 'UserLocalConfigStore'), 'Software'), 'Valve'), 'Steam'), 'apps') || {};
    for (const [id, a] of Object.entries(apps)) {
      if (a && typeof a === 'object') {
        res[id] = {
          last: (parseInt(ci(a, 'LastPlayed') || '0', 10) || 0) * 1000,
          minutes: parseInt(ci(a, 'Playtime') || '0', 10) || 0,
        };
      }
    }
  } catch { /* ignore */ }
  return res;
}

function scanSteam(steamPath) {
  const games = [];
  if (!steamPath || !exists(steamPath)) return games;
  const libs = new Set([path.normalize(steamPath)]);
  try {
    const v = parseVdf(read(path.join(steamPath, 'steamapps', 'libraryfolders.vdf')));
    const lf = ci(v, 'libraryfolders') || {};
    for (const k of Object.keys(lf)) {
      const e = lf[k];
      const p = typeof e === 'string' ? (/^\d+$/.test(k) ? e : null) : ci(e, 'path');
      if (p) libs.add(path.normalize(p));
    }
  } catch { /* une seule bibliothèque */ }
  const stats = steamPlayStats(steamPath);
  const seen = new Set();
  for (const lib of libs) {
    const apps = path.join(lib, 'steamapps');
    let files = [];
    try { files = fs.readdirSync(apps).filter((f) => /^appmanifest_\d+\.acf$/i.test(f)); } catch { continue; }
    for (const f of files) {
      try {
        const st = ci(parseVdf(read(path.join(apps, f))), 'AppState');
        if (!st) continue;
        const appid = String(ci(st, 'appid') || '');
        const name = String(ci(st, 'name') || '').trim();
        if (!appid || seen.has(appid) || STEAM_SKIP_IDS.has(appid) || !name || SKIP_NAME.test(name)) continue;
        const dir = path.join(apps, 'common', String(ci(st, 'installdir') || ''));
        if (!exists(dir)) continue;
        seen.add(appid);
        const cover = steamCover(steamPath, appid);
        games.push({
          id: 'steam:' + appid, name, source: 'steam', dir,
          launch: { type: 'url', url: 'steam://rungameid/' + appid },
          cover: cover?.file || null, coverPortrait: !!cover?.portrait,
          lastPlayed: stats[appid]?.last || 0, playtime: stats[appid]?.minutes || 0,
        });
      } catch { /* manifeste illisible */ }
    }
  }
  return games;
}

// ---------------------------------------------------------------------------
// Epic Games
// ---------------------------------------------------------------------------
function scanEpic(manifestDir) {
  const games = [];
  let files = [];
  try { files = fs.readdirSync(manifestDir).filter((f) => /\.item$/i.test(f)); } catch { return games; }
  for (const f of files) {
    try {
      const m = JSON.parse(read(path.join(manifestDir, f)));
      if (m.bIsIncompleteInstall) continue;
      if (m.MainGameAppName && m.MainGameAppName !== m.AppName) continue; // DLC
      const cats = (m.AppCategories || []).map(String);
      if (cats.length && !cats.includes('games')) continue;
      if (!m.InstallLocation || !exists(m.InstallLocation)) continue;
      const exe = m.LaunchExecutable ? path.join(m.InstallLocation, m.LaunchExecutable) : null;
      const url = 'com.epicgames.launcher://apps/'
        + `${encodeURIComponent(m.CatalogNamespace || '')}%3A${encodeURIComponent(m.CatalogItemId || '')}%3A${encodeURIComponent(m.AppName)}`
        + '?action=launch&silent=true';
      games.push({
        id: 'epic:' + m.AppName, name: m.DisplayName || m.AppName, source: 'epic', dir: m.InstallLocation,
        exe: exe && exists(exe) ? exe : null, launch: { type: 'url', url },
      });
    } catch { /* fichier illisible */ }
  }
  return games;
}

// ---------------------------------------------------------------------------
// Riot Games
// ---------------------------------------------------------------------------
const RIOT_NAMES = { valorant: 'VALORANT', league_of_legends: 'League of Legends', bacon: 'Legends of Runeterra', lion: '2XKO' };
const RIOT_EXE = {
  valorant: ['live/VALORANT.exe', 'VALORANT.exe', 'live/ShooterGame/Binaries/Win64/VALORANT-Win64-Shipping.exe'],
  league_of_legends: ['LeagueClient.exe', 'Game/League of Legends.exe'],
  bacon: ['LoR.exe'],
};

function scanRiot(programData) {
  const base = path.join(programData, 'Riot Games');
  const games = [];
  let rc = null;
  try {
    const j = JSON.parse(read(path.join(base, 'RiotClientInstalls.json')));
    rc = [j.rc_default, j.rc_live, ...Object.values(j)].find((v) => typeof v === 'string' && /\.exe$/i.test(v) && exists(v)) || null;
  } catch { /* pas de client Riot */ }
  let dirs = [];
  try { dirs = fs.readdirSync(path.join(base, 'Metadata')); } catch { return games; }
  for (const d of dirs) {
    const m = /^(.+)\.([^.]+)$/.exec(d);
    if (!m) continue;
    const [, product, patchline] = m;
    if (product === 'riot_client') continue;
    let install = null;
    try {
      const y = read(path.join(base, 'Metadata', d, `${d}.product_settings.yaml`));
      install = (/product_install_full_path:\s*"?([^"\r\n]+?)"?\s*$/m.exec(y) || [])[1] || null;
    } catch { /* ignore */ }
    if (!install || !exists(install)) continue;
    const exe = firstExisting(install, RIOT_EXE[product]) || findMainExe(install);
    const launch = rc
      ? { type: 'exec', file: rc, args: [`--launch-product=${product}`, `--launch-patchline=${patchline}`] }
      : exe ? { type: 'exec', file: exe, args: [] } : null;
    if (!launch) continue;
    const name = RIOT_NAMES[product] || product.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    games.push({ id: `riot:${d}`, name: patchline === 'live' ? name : `${name} (${patchline})`, source: 'riot', dir: install, exe, launch });
  }
  return games;
}

// ---------------------------------------------------------------------------
// Registre + Xbox (un seul appel PowerShell, sortie UTF-8 en JSON)
// ---------------------------------------------------------------------------
const PS_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$out = [ordered]@{}
$out.steamPath = (Get-ItemProperty 'HKCU:\Software\Valve\Steam').SteamPath
$un = @()
foreach ($root in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall','HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall') {
  foreach ($k in Get-ChildItem $root) {
    $p = Get-ItemProperty $k.PSPath
    if ($p.DisplayName -and -not $p.SystemComponent) {
      $un += [pscustomobject]@{ key = $k.PSChildName; name = $p.DisplayName; publisher = $p.Publisher; icon = $p.DisplayIcon; dir = $p.InstallLocation; uninstall = $p.UninstallString }
    }
  }
}
$out.uninstall = $un
$gog = @()
foreach ($k in Get-ChildItem 'HKLM:\SOFTWARE\WOW6432Node\GOG.com\Games') {
  $p = Get-ItemProperty $k.PSPath
  $gog += [pscustomobject]@{ id = $p.gameID; name = $p.gameName; exe = $p.exe; dir = $p.path; workingDir = $p.workingDir }
}
$out.gog = $gog
$ubi = @()
foreach ($k in Get-ChildItem 'HKLM:\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs') {
  $p = Get-ItemProperty $k.PSPath
  $ubi += [pscustomobject]@{ id = $k.PSChildName; dir = $p.InstallDir }
}
$out.ubisoft = $ubi
$start = @{}
foreach ($s in Get-StartApps) { $start[$s.AppID] = $s.Name }
$xbox = @()
foreach ($pkg in Get-AppxPackage) {
  if ($pkg.IsFramework -or -not $pkg.InstallLocation) { continue }
  if (-not (Test-Path -LiteralPath (Join-Path $pkg.InstallLocation 'MicrosoftGame.config'))) { continue }
  $m = Get-AppxPackageManifest $pkg
  foreach ($a in @($m.Package.Applications.Application)) {
    $aumid = "$($pkg.PackageFamilyName)!$($a.Id)"
    $name = $start[$aumid]
    if (-not $name) { $name = $m.Package.Properties.DisplayName }
    if (-not $name -or $name -like 'ms-resource:*') { $name = $pkg.Name }
    $logo = $null
    $rel = $a.VisualElements.Square150x150Logo
    if (-not $rel) { $rel = $m.Package.Properties.Logo }
    if ($rel) {
      $full = Join-Path $pkg.InstallLocation $rel
      if (Test-Path -LiteralPath $full) { $logo = $full }
      else {
        $f = Get-ChildItem -LiteralPath (Split-Path $full) -Filter ([IO.Path]::GetFileNameWithoutExtension($full) + '*.png') | Sort-Object Length -Descending | Select-Object -First 1
        if ($f) { $logo = $f.FullName }
      }
    }
    $xbox += [pscustomobject]@{ aumid = $aumid; name = $name; dir = $pkg.InstallLocation; logo = $logo }
    break
  }
}
$out.xbox = $xbox
$out | ConvertTo-Json -Depth 4 -Compress
`;

function runPowerShell() {
  return new Promise((resolve) => {
    const encoded = Buffer.from(PS_SCRIPT, 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: 90000, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout) => {
        try {
          const text = String(stdout || '').replace(/^\uFEFF/, '').trim();
          resolve(text ? JSON.parse(text.slice(text.indexOf('{'))) : {});
        } catch { resolve({}); }
      });
  });
}
const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

function scanGog(list) {
  return arr(list).filter((g) => g && g.name && g.exe && exists(g.exe)).map((g) => ({
    id: 'gog:' + (g.id || hash(g.exe)), name: g.name, source: 'gog', dir: g.dir || path.dirname(g.exe), exe: g.exe,
    launch: { type: 'exec', file: g.exe, args: [], cwd: g.workingDir || g.dir || path.dirname(g.exe) },
  }));
}

function scanUbisoft(list) {
  return arr(list).filter((g) => g && g.id && g.dir && exists(g.dir)).map((g) => ({
    id: 'ubisoft:' + g.id, name: path.basename(String(g.dir).replace(/[\\/]+$/, '')), source: 'ubisoft', dir: g.dir,
    exe: findMainExe(g.dir), launch: { type: 'url', url: `uplay://launch/${g.id}/0` },
  }));
}

function scanXbox(list) {
  return arr(list).filter((g) => g && g.aumid && g.name).map((g) => ({
    id: 'xbox:' + g.aumid.split('!')[0], name: g.name, source: 'xbox', dir: g.dir,
    iconFile: g.logo || null, launch: { type: 'aumid', aumid: g.aumid },
  }));
}

// Battle.net : code du jeu à partir de son identifiant (--uid=…)
const BNET_CODES = {
  prometheus: 'Pro', wow: 'WoW', wow_classic: 'WoWC', d3: 'D3', diablo3: 'D3', fenris: 'Fen', diablo4: 'Fen',
  osi: 'OSI', hs_beta: 'WTCG', hearthstone: 'WTCG', heroes: 'Hero', s2: 'S2', s1: 'S1', w3: 'W3',
  odin: 'ODIN', lazarus: 'LAZR', viper: 'VIPR', zeus: 'ZEUS', fore: 'FORE', auks: 'AUKS', anbs: 'ANBS',
  rtro: 'RTRO', wlby: 'WLBY', aqua: 'AQUA', spot: 'SPOT',
};
const GAME_PUBLISHERS = /Blizzard|Activision|Rockstar Games|Electronic Arts|Bethesda|CD PROJEKT|Bungie|Mojang|2K Games|Square Enix|BANDAI NAMCO|CAPCOM|SEGA|Paradox|KRAFTON|miHoYo|HoYoverse|COGNOSPHERE|Kuro Games|Hypergryph|Supercell|Garena|NetEase|Nintendo|Xbox Game Studios|Microsoft Studios|Warner Bros\. Games|THQ Nordic|Focus Entertainment|Devolver|Team17|Ubisoft|Riot Games|Epic Games|Valve|Gearbox|Respawn|id Software|FromSoftware|Grinding Gear|Digital Extremes|Wargaming|Gaijin/i;
const NOT_GAME = /launcher|battle\.net$|^battle\.net|EA app|^Origin$|Uplay|Ubisoft Connect|Redistributable|Runtime|Anti-?Cheat|Vanguard|Overlay|Riot Client|Rockstar Games Launcher|Social Club|Epic Online Services|Steam$|Update|Driver|Toolkit|Editor|Server|Benchmark|Uninstall|HoYoPlay|DirectX|PhysX|Visual C\+\+|\.NET/i;

function findBattleNetExe(entries) {
  const self = arr(entries).find((e) => /^Battle\.net$/i.test((e.name || '').trim()));
  const cands = [];
  if (self?.dir) cands.push(path.join(cleanPath(self.dir), 'Battle.net.exe'));
  if (self?.icon) cands.push(cleanPath(self.icon));
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  cands.push(path.join(pf86, 'Battle.net', 'Battle.net.exe'), path.join(pf, 'Battle.net', 'Battle.net.exe'));
  return cands.find((c) => c && /Battle\.net\.exe$/i.test(c) && exists(c)) || null;
}

function scanUninstall(entries, knownDirs) {
  const games = [];
  const bnetExe = findBattleNetExe(entries);
  const seen = new Set();
  for (const e of arr(entries)) {
    const name = String(e.name || '').trim();
    if (!name || NOT_GAME.test(name) || /^Steam App \d+$/i.test(e.key || '')) continue;
    const un = String(e.uninstall || '');
    const pub = String(e.publisher || '');
    const uid = (/--uid=([^\s"]+)/i.exec(un) || [])[1];
    const isBnet = !!uid && /Blizzard|Battle\.net/i.test(un);
    const isEA = /EA Desktop|EAInstaller|Electronic Arts\\EA Desktop|Origin/i.test(un) || /Electronic Arts/i.test(pub);
    const isRockstar = /Rockstar Games/i.test(pub) || /Rockstar Games Launcher/i.test(un);
    const isHoyo = /miHoYo|HoYoverse|COGNOSPHERE/i.test(pub);
    if (!(isBnet || isEA || isRockstar || isHoyo || GAME_PUBLISHERS.test(pub))) continue;

    const icon = cleanPath(e.icon);
    let exe = icon && /\.exe$/i.test(icon) && !SKIP_EXE.test(path.basename(icon)) && exists(icon) ? icon : null;
    const dir = cleanPath(e.dir) || (exe ? path.dirname(exe) : null);
    if (!exe && dir && exists(dir)) exe = findMainExe(dir);
    if (dir && knownDirs.has(norm(dir))) continue;

    let launch = null;
    let id;
    let source = isBnet ? 'battlenet' : isEA ? 'ea' : isRockstar ? 'rockstar' : isHoyo ? 'hoyo' : 'autre';
    if (isBnet) {
      id = 'battlenet:' + uid.toLowerCase();
      const code = BNET_CODES[uid.toLowerCase()] || uid.toUpperCase();
      if (bnetExe) launch = { type: 'exec', file: bnetExe, args: [`--exec=launch ${code}`] };
      else if (exe) launch = { type: 'exec', file: exe, args: [] };
    } else {
      id = 'app:' + hash(e.key || name);
      if (exe) launch = { type: 'exec', file: exe, args: [] };
    }
    if (!launch || seen.has(id)) continue;
    seen.add(id);
    games.push({ id, name, source, dir, exe, launch });
  }
  return games;
}

// ---------------------------------------------------------------------------
// Emplacements habituels (HoYoverse, Roblox, Minecraft)
// ---------------------------------------------------------------------------
function scanKnown(env) {
  const games = [];
  const pf = env.ProgramFiles || 'C:\\Program Files';
  const pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = env.LOCALAPPDATA || '';
  const roots = [pf, pf86, 'C:\\', 'D:\\', 'E:\\'];
  const known = [
    { id: 'hoyo:genshin', name: 'Genshin Impact', rel: ['HoYoPlay\\games\\Genshin Impact game\\GenshinImpact.exe', 'Genshin Impact\\Genshin Impact game\\GenshinImpact.exe', 'HoYoPlay\\games\\Genshin Impact game\\YuanShen.exe'] },
    { id: 'hoyo:starrail', name: 'Honkai: Star Rail', rel: ['HoYoPlay\\games\\Star Rail Games\\StarRail.exe', 'Star Rail\\Games\\StarRail.exe', 'HoYoPlay\\games\\Star Rail game\\StarRail.exe'] },
    { id: 'hoyo:zzz', name: 'Zenless Zone Zero', rel: ['HoYoPlay\\games\\ZenlessZoneZero Game\\ZenlessZoneZero.exe', 'ZenlessZoneZero\\ZenlessZoneZero Game\\ZenlessZoneZero.exe'] },
    { id: 'minecraft:legacy', name: 'Minecraft Launcher', source: 'minecraft', rel: ['Minecraft Launcher\\MinecraftLauncher.exe', 'Minecraft\\MinecraftLauncher.exe'] },
  ];
  for (const k of known) {
    let file = null;
    for (const r of roots) { for (const rel of k.rel) { const f = path.join(r, rel); if (exists(f)) { file = f; break; } } if (file) break; }
    if (file) games.push({ id: k.id, name: k.name, source: k.source || 'hoyo', dir: path.dirname(file), exe: file, launch: { type: 'exec', file, args: [] } });
  }
  // Roblox : la version la plus récente dans %LOCALAPPDATA%\Roblox\Versions
  try {
    const vdir = path.join(local, 'Roblox', 'Versions');
    let best = null;
    let bestT = 0;
    for (const v of fs.readdirSync(vdir)) {
      const f = path.join(vdir, v, 'RobloxPlayerBeta.exe');
      try { const t = fs.statSync(f).mtimeMs; if (t > bestT) { bestT = t; best = f; } } catch { /* ignore */ }
    }
    if (best) games.push({ id: 'roblox', name: 'Roblox', source: 'roblox', dir: path.dirname(best), exe: best, launch: { type: 'exec', file: best, args: [] } });
  } catch { /* pas de Roblox */ }
  return games;
}

// ---------------------------------------------------------------------------
// Réglages et état (games.json dans %APPDATA%\Simply Hub)
// ---------------------------------------------------------------------------
const store = {
  custom: [], hidden: [], favorites: [], played: {}, minimizeOnLaunch: true, cache: [],
};
let storeFile = null;
let games = new Map();
let scanning = null;
let lastScan = 0;
const listeners = new Set();
const iconCache = new Map();

function load(userData) {
  storeFile = path.join(userData, 'games.json');
  try { Object.assign(store, JSON.parse(read(storeFile))); } catch { /* première fois */ }
  for (const g of store.cache || []) games.set(g.id, g);
  for (const c of store.custom) games.set(c.id, customToGame(c));
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(storeFile, JSON.stringify(store, null, 1)); } catch { /* ignore */ }
  }, 300);
}
function emit() { for (const fn of listeners) { try { fn(); } catch { /* ignore */ } } }

function customToGame(c) {
  const isExe = /\.exe$/i.test(c.file);
  return {
    id: c.id, name: c.name, source: 'ajout', custom: true, dir: path.dirname(c.file), exe: isExe ? c.file : null, file: c.file,
    launch: isExe ? { type: 'exec', file: c.file, args: [] } : { type: 'open', file: c.file },
  };
}

const SOURCE_ORDER = ['steam', 'epic', 'riot', 'battlenet', 'xbox', 'gog', 'ubisoft', 'hoyo', 'roblox', 'minecraft', 'ea', 'rockstar', 'autre'];

async function scan() {
  if (scanning) return scanning;
  scanning = (async () => {
    if (process.platform !== 'win32') return;
    const env = process.env;
    const programData = env.ProgramData || 'C:\\ProgramData';
    const reg = await runPowerShell();
    const steamPath = reg.steamPath ? path.normalize(reg.steamPath) : path.join(env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Steam');

    const found = [
      ...scanSteam(steamPath),
      ...scanEpic(path.join(programData, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests')),
      ...scanRiot(programData),
      ...scanXbox(reg.xbox),
      ...scanGog(reg.gog),
      ...scanUbisoft(reg.ubisoft),
      ...scanKnown(env),
    ];
    const knownDirs = new Set(found.map((g) => norm(g.dir)).filter(Boolean));
    found.push(...scanUninstall(reg.uninstall, knownDirs));

    // Doublons : même id, ou même dossier d'installation (on garde la meilleure source)
    const byId = new Map();
    const byDir = new Map();
    for (const g of found.sort((a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source))) {
      if (byId.has(g.id)) continue;
      const d = norm(g.dir);
      if (d && byDir.has(d) && g.source !== 'xbox') continue;
      byId.set(g.id, g);
      if (d) byDir.set(d, g.id);
    }
    const next = new Map(byId);
    for (const c of store.custom) next.set(c.id, customToGame(c));
    games = next;
    store.cache = [...byId.values()];
    lastScan = Date.now();
    save();
  })().finally(() => { scanning = null; emit(); });
  emit();
  return scanning;
}

// ---------------------------------------------------------------------------
// Icônes et images
// ---------------------------------------------------------------------------
async function iconFor(g) {
  const file = g.exe || (g.launch?.type === 'open' ? g.launch.file : null);
  if (!file || !exists(file)) return null;
  if (iconCache.has(file)) return iconCache.get(file);
  let url = null;
  try {
    const img = await E().app.getFileIcon(file, { size: 'large' });
    if (img && !img.isEmpty()) url = img.toDataURL();
  } catch { /* pas d'icône */ }
  iconCache.set(file, url);
  return url;
}

function mediaFile(key) {
  const [kind, ...rest] = String(key).split('/');
  const g = games.get(rest.join('/'));
  if (!g) return null;
  const f = kind === 'cover' ? g.cover : kind === 'logo' ? g.iconFile : null;
  return f && exists(f) ? f : null;
}

// ---------------------------------------------------------------------------
// Liste pour la page
// ---------------------------------------------------------------------------
async function list() {
  const out = [];
  for (const g of games.values()) {
    const own = store.played[g.id] || {};
    out.push({
      id: g.id,
      name: g.name,
      source: g.source,
      custom: !!g.custom,
      favorite: store.favorites.includes(g.id),
      hidden: store.hidden.includes(g.id),
      lastPlayed: Math.max(g.lastPlayed || 0, own.last || 0),
      playtime: g.playtime || 0,
      launches: own.count || 0,
      cover: g.cover ? `poseyhub://app/media/cover/${encodeURIComponent(g.id)}` : null,
      coverPortrait: !!g.coverPortrait,
      icon: g.iconFile ? `poseyhub://app/media/logo/${encodeURIComponent(g.id)}` : await iconFor(g),
    });
  }
  return {
    games: out,
    scanning: !!scanning,
    lastScan,
    minimizeOnLaunch: store.minimizeOnLaunch,
    platform: process.platform,
  };
}

// ---------------------------------------------------------------------------
// Lancer un jeu
// ---------------------------------------------------------------------------
function execDetached(file, args, cwd) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(file, args || [], { cwd: cwd && exists(cwd) ? cwd : path.dirname(file), detached: true, stdio: 'ignore', windowsHide: false });
    } catch (e) { reject(e); return; }
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

async function launch(id) {
  const g = games.get(id);
  if (!g || !g.launch) throw new Error('Jeu introuvable, actualise la liste.');
  const { shell } = E();
  const L = g.launch;
  if (L.type === 'url') {
    await shell.openExternal(L.url);
  } else if (L.type === 'aumid') {
    await execDetached('explorer.exe', ['shell:AppsFolder\\' + L.aumid], process.env.SystemRoot || 'C:\\Windows');
  } else if (L.type === 'open') {
    if (!exists(L.file)) throw new Error('Fichier introuvable : ' + L.file);
    const err = await shell.openPath(L.file);
    if (err) throw new Error(err);
  } else if (L.type === 'exec') {
    if (!exists(L.file)) throw new Error('Programme introuvable. Le jeu a peut-être été déplacé ou désinstallé : actualise la liste.');
    try {
      await execDetached(L.file, L.args, L.cwd);
    } catch (e) {
      // Jeu qui demande les droits administrateur (ex. Genshin) : on passe par Windows, qui affiche la demande
      if (!L.args?.length && ['EACCES', 'EPERM', 'UNKNOWN'].includes(e.code)) {
        const err = await shell.openPath(L.file);
        if (err) throw new Error(err);
      } else throw e;
    }
  }
  const p = store.played[id] || { count: 0, last: 0 };
  store.played[id] = { count: p.count + 1, last: Date.now() };
  save();
  emit();
  return { name: g.name, minimize: store.minimizeOnLaunch };
}

// ---------------------------------------------------------------------------
// Actions de la page
// ---------------------------------------------------------------------------
function toggle(listName, id) {
  const l = store[listName];
  const i = l.indexOf(id);
  if (i >= 0) l.splice(i, 1); else l.push(id);
  save();
  emit();
}

function addCustom(files) {
  let added = 0;
  for (const file of files || []) {
    if (!exists(file)) continue;
    const id = 'custom:' + hash(norm(file));
    if (store.custom.some((c) => c.id === id)) continue;
    const name = path.basename(file).replace(/\.(exe|lnk|url|bat|cmd)$/i, '').replace(/[-_]+/g, ' ').trim();
    const c = { id, name, file };
    store.custom.push(c);
    games.set(id, customToGame(c));
    added++;
  }
  if (added) { save(); emit(); }
  return added;
}

function removeCustom(id) {
  store.custom = store.custom.filter((c) => c.id !== id);
  games.delete(id);
  save();
  emit();
}

function rename(id, name) {
  name = String(name || '').trim().slice(0, 80);
  const c = store.custom.find((x) => x.id === id);
  if (!c || !name) return false;
  c.name = name;
  games.set(id, customToGame(c));
  save();
  emit();
  return true;
}

function folderOf(id) {
  const g = games.get(id);
  if (!g) return null;
  const d = g.dir && exists(g.dir) ? g.dir : g.exe ? path.dirname(g.exe) : null;
  return d && exists(d) ? d : null;
}

module.exports = {
  // pour Simply Hub
  load, scan, list, launch, mediaFile, folderOf, addCustom, removeCustom, rename,
  toggleFavorite: (id) => toggle('favorites', id),
  toggleHidden: (id) => toggle('hidden', id),
  unhideAll: () => { store.hidden = []; save(); emit(); },
  setMinimize: (v) => { store.minimizeOnLaunch = !!v; save(); emit(); },
  get: (id) => games.get(id),
  isScanning: () => !!scanning,
  lastScan: () => lastScan,
  onChange: (fn) => listeners.add(fn),
  // pour les tests
  _test: { parseVdf, scanSteam, scanEpic, scanRiot, scanGog, scanUbisoft, scanXbox, scanUninstall, scanKnown, cleanPath, findMainExe },
};
