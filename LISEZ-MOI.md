# Simply Hub — par PoseyDevs

**YouTube, Discord, Spotify et tous tes jeux dans une seule appli Windows.**
C'est une vraie appli de bureau (.exe) avec sa propre fenêtre. Pas besoin d'ouvrir un navigateur.

**Télécharger l'appli toute prête : https://angelotkkt.github.io/PoseyHub/**
Chaque modification envoyée sur GitHub fabrique automatiquement un nouveau `.exe`. Les Simply Hub déjà installés se mettent à jour tout seuls.
La suite de ce fichier explique comment fabriquer l'appli toi-même sur ton PC.

---

## Créer le .exe (une seule fois)

1. Installe **Node.js** (version **LTS**) depuis https://nodejs.org si tu ne l'as pas déjà.
2. Dézippe le dossier `Simply Hub`.
3. Double-clique sur **`CREER-LE-EXE.bat`**.
4. Attends quelques minutes. Le dossier `dist` s'ouvre ensuite tout seul avec :
   - **`SimplyHub-portable.exe`** : se lance directement, sans installation (tu peux le mettre sur une clé USB).
   - **`SimplyHub-Setup.exe`** : installe l'appli avec un raccourci sur le bureau et dans le menu Démarrer.

> Pour essayer l'appli avant de créer le .exe : `TESTER-SANS-COMPILER.bat`.

---

## Spotify

L'onglet Spotify affiche le **lecteur web officiel** (open.spotify.com) : connecte-toi avec ton compte Spotify comme sur le site.
- **Depuis l'icône près de l'horloge** (clic droit) : lecture/pause, titre suivant, titre précédent.
- **Si la musique refuse de démarrer :** Spotify utilise la même protection que Netflix (Widevine). Voir la section « Streaming » pour la signature VMP.

---

## Fonctionnalités

| | |
|---|---|
| **3 services dans une fenêtre** | barre latérale à gauche, comme sur Discord |
| **Connexion conservée** | tu te connectes une fois, chaque service garde ses propres cookies |
| **Tout tourne en même temps** | la musique Spotify continue quand tu passes sur Discord ou YouTube |
| **Pastilles de notifications** | le nombre de messages non lus s'affiche sur l'icône et dans la barre des tâches |
| **Notifications Windows** | Discord peut t'envoyer des notifications |
| **Zone de notification** | la croix réduit l'appli près de l'horloge, et un clic droit sur l'icône permet de mettre Spotify en lecture/pause ou de passer au titre suivant |
| **Plein écran des vidéos** | YouTube en plein écran prend tout l'écran |
| **Partage d'écran / micro / caméra** | fonctionne dans les appels Discord |
| **Clic droit** | copier, coller, copier un lien, corrections d'orthographe |
| **Liens externes** | s'ouvrent dans ton navigateur habituel |
| **Mémoire de la fenêtre** | taille, position et dernier service ouvert sont retenus |
| **Démarrage avec Windows** | option dans ⚙️ Réglages (l'appli démarre alors en arrière-plan) |

### Raccourcis clavier

| Touche | Action |
|---|---|
| `Ctrl+1` à `Ctrl+8` | YouTube, Discord, Spotify, Jeux, Netflix, Disney+, HBO Max, Prime Video (selon l'ordre choisi) |
| `Ctrl+Tab` | Service suivant |
| `Ctrl+,` | Réglages |
| `Ctrl+L` ou `Ctrl+K` | Barre de recherche (onglet Recherche) |
| `Ctrl+M` | Couper / remettre le son du service ouvert |
| `Ctrl+R` ou `F5` | Actualiser |
| `Alt+←` / `Alt+→` | Page précédente / suivante |
| `F11` | Plein écran |
| `Ctrl+Shift+I` | Outils de développement |

---

## Jeux (Gaming Hub)

L'onglet **Jeux** (`Ctrl+4`) trouve tout seul les jeux installés sur ton PC et les lance en un clic :
**Steam** (avec les jaquettes et ton temps de jeu), **Epic Games**, **Riot** (VALORANT, LoL), **Battle.net** (Call of Duty…), **Xbox / Game Pass**, **GOG**, **Ubisoft Connect**, **EA**, **Rockstar**, **HoYoverse** (Genshin, Star Rail, ZZZ), **Roblox** et **Minecraft**.

- **Reprendre :** ton dernier jeu en grand, puis les jeux joués récemment.
- **Favoris :** clique sur l'étoile d'un jeu.
- **Trouver un jeu :** recherche (touche `/`), filtres par plateforme, tri (récents, nom, temps de jeu).
- **Jouer :** double-clic, touche `Entrée` ou bouton ▶.
- **Clic droit :** favori, ouvrir le dossier du jeu, masquer.
- **Ajouter un jeu :** si un jeu n'est pas trouvé, choisis son `.exe` ou son raccourci. Tu peux ensuite le renommer.
- **Réduire Simply Hub quand un jeu se lance :** option en bas de la page.

Tout se passe sur ton PC : Simply Hub lit les dossiers des launchers, le registre Windows et le cache local de Steam. Rien n'est envoyé sur Internet.

---

## Streaming : Netflix, Disney+, HBO Max, Prime Video

Les quatre plateformes sont dans la barre latérale, sous un séparateur. Chacune garde sa propre connexion et ne se charge que quand tu l'ouvres.

### Pour que les vidéos se lancent : la signature VMP (une seule fois)
Ces plateformes protègent leurs vidéos avec Widevine. Elles exigent aussi que l'appli soit **signée VMP** par castLabs, l'entreprise qui fournit la version d'Electron utilisée par Simply Hub.
Sans cette signature, une vidéo peut afficher une erreur du type « lecture protégée » (Netflix : code M7701…).
La signature est gratuite. Elle se fait toute seule sur GitHub une fois ton compte castLabs ajouté :

1. Installe **Python** depuis https://www.python.org (coche « Add python.exe to PATH »).
2. Dans un terminal, tape :
   ```bat
   pip install castlabs-evs
   python -m castlabs_evs.account signup
   ```
   Choisis un nom de compte et un mot de passe, puis confirme l'e-mail que tu reçois.
3. Sur GitHub, va dans le dépôt PoseyHub, puis **Settings → Secrets and variables → Actions → New repository secret**, et ajoute deux secrets :
   - `EVS_ACCOUNT` : ton nom de compte castLabs
   - `EVS_PASSWD` : ton mot de passe castLabs
4. Va dans **Actions → Programme Windows → Run workflow** pour refabriquer l'appli. Les prochaines versions seront signées automatiquement.

Dans **Réglages → Streaming**, la ligne « Protection vidéo » indique si ta version est signée.

Même signée, la qualité peut être limitée (souvent 720p à 1080p selon la plateforme), comme dans un navigateur Chrome.

---

## Recherche

L'onglet **Recherche** (icône loupe) affiche la page officielle du moteur de recherche que tu choisis :
Google, Bing, DuckDuckGo, Qwant, Ecosia, Brave Search, Startpage, Yahoo, Perplexity, Lilo, Yandex, Kagi, ou un **moteur personnalisé**.

- **Changer de moteur à tout moment :**
  - le bouton du moteur (à gauche de la barre du haut) ;
  - un clic droit sur l'icône loupe → *Moteur de recherche* ;
  - **Réglages → Recherche**.
- **Barre du haut :** tape une recherche ou une adresse de site, puis `Entrée`. Le raccourci `Ctrl+L` (ou `Ctrl+K`) y mène depuis n'importe quel onglet.
- **Liens des résultats :** ils s'ouvrent dans l'onglet, comme dans un navigateur.
- **Moteur personnalisé :** donne sa page d'accueil et, si tu veux, son adresse de recherche avec `%s` à la place du texte (ex. `https://www.exemple.com/search?q=%s`).

---

## Réglages

La roue crantée en bas à gauche (ou `Ctrl+,`) ouvre la page **Réglages**. On y trouve une recherche et ces sections :
- **Général :** lancement avec Windows, démarrage en arrière-plan, garder l'appli près de l'horloge, toujours au premier plan, charger tous les services au lancement.
- **Apparence :** 5 thèmes (Nuit, Noir OLED, Ardoise, Aubergine, Forêt), couleur d'accent, noms sous les icônes, zoom des pages.
- **Services :** afficher ou masquer chaque service, changer leur ordre, couper le son, notifications Windows, vider le cache, se déconnecter.
- **Discord & Vencord**, **Spotify**, **Jeux**, **Notifications** et **À propos** (mises à jour, dossier des données, réinitialisation).

Le clic droit sur une icône de la barre latérale donne aussi un menu rapide (actualiser, couper le son, notifications, masquer).

## Vencord (Discord)

Simply Hub peut ajouter **Vencord** à Discord : des plugins (messages supprimés visibles, réactions améliorées…) et des thèmes.
- Simply Hub n'inclut pas Vencord. Au premier lancement, il télécharge la version officielle depuis GitHub (https://github.com/Vendicated/Vencord), puis vérifie les nouveautés toutes les 12 heures.
- Les plugins et thèmes se règlent dans Discord : **Paramètres utilisateur → section Vencord**.
- Tu peux le couper à tout moment dans **Réglages → Discord & Vencord**.

Vencord est un projet indépendant (licence GPL-3.0). Les mods de client vont à l'encontre des conditions d'utilisation de Discord : utilise-le en connaissance de cause.

---

## Problèmes possibles

### Le lecteur intégré Simply Hub ne lit pas la musique
Le lecteur intégré utilise une protection anti-copie appelée Widevine. Simply Hub utilise la version d'Electron de **castLabs**, qui la contient.
La solution la plus simple est de choisir l'**appli Spotify officielle** comme appareil (en bas à droite).
Tu peux aussi essayer la *signature VMP* gratuite de castLabs, parce que l'exe compilé n'est pas signé :

```bat
pip install --upgrade castlabs-evs
python -m castlabs_evs.account signup
set POSEYHUB_VMP=1
npm run dist
```

### Google refuse la connexion (« Ce navigateur n'est peut-être pas sécurisé »)
Ça peut arriver avec les applis de bureau. Solutions :
- Connecte-toi d'abord sur YouTube avec ton adresse et ton mot de passe, plutôt qu'avec « Se connecter avec Google » depuis un autre site.

### Me déconnecter d'un service
⚙️ Réglages (en bas à gauche) → **Se déconnecter de …**

### Quitter complètement l'appli
Clic droit sur l'icône près de l'horloge → **Quitter Simply Hub**.
Tu peux aussi décocher « Garder ouvert dans la zone de notification » dans ⚙️ Réglages.

---

## Personnaliser

Tout se règle dans `src/main.js` :
- **Ajouter un service** (Twitch, WhatsApp, Netflix…) : ajoute une ligne dans la liste `SERVICES` en haut du fichier.
  L'icône s'ajoute dans `ICONS` dans `src/index.html`.
- **Changer l'icône de l'appli** : remplace `assets/icon.png` (512×512) et `assets/tray.png` (32×32).
  Tu peux y mettre ton logo PoseyDevs.
- **Changer le nom ou la version** : `productName` et `version` dans `package.json`.

Les données de l'appli (connexions, réglages) sont stockées dans `%APPDATA%\Simply Hub`.
