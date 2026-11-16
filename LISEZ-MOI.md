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

## Spotify : connexion officielle

L'onglet Spotify n'affiche pas le site de Spotify. C'est un **lecteur Simply Hub** relié à ton compte par la **connexion officielle de Spotify** (Spotify for Developers / Web API).
À la première ouverture, l'onglet t'explique tout, étape par étape :

1. Sur https://developer.spotify.com/dashboard, clique sur **Create app**.
2. Redirect URI : `http://127.0.0.1:47823/callback`. Coche **Web API** et **Web Playback SDK**, puis enregistre.
3. Colle le **Client ID** dans Simply Hub, puis clique sur **Se connecter avec Spotify**. La page de connexion officielle s'ouvre dans ton navigateur. Tu acceptes, et c'est fini.

Ce que tu peux faire ensuite :
- **Pages :** accueil (écoutés récemment, tes playlists, tes titres du moment), recherche, bibliothèque, playlists, albums et artistes.
- **Lecture :** play/pause, suivant, précédent, aléatoire, répétition, avancer dans le titre, volume, et bouton ♥ pour liker un titre.
- **Choix de l'appareil** (Spotify Connect) : Simply Hub lui-même, l'**appli Spotify officielle** sur ton PC, ton téléphone, une enceinte…
- **Depuis l'icône près de l'horloge :** lecture/pause, suivant, précédent.

**Règles de Spotify à connaître :**
- Le compte qui crée l'appli sur Spotify for Developers doit avoir **Spotify Premium**.
- **5 comptes maximum** peuvent utiliser ton Client ID. Pour un autre compte que le tien, ajoute son e-mail dans *User Management* de ton appli Spotify for Developers.
- Pour contrôler la lecture, il faut aussi Premium.
- Pour les playlists que tu suis sans les avoir créées, Spotify ne donne pas la liste des titres. Tu peux quand même les lancer.

**Si « Lecteur Simply Hub indisponible » s'affiche :** le lecteur intégré de Spotify n'est pas officiellement prévu pour les applis de bureau, donc il peut parfois refuser de marcher.
Dans ce cas, clique sur l'appareil en bas à droite, puis sur **Ouvrir l'appli Spotify officielle**, et choisis-la. Simply Hub la pilote alors à distance.

Les identifiants de connexion sont chiffrés avec le coffre de Windows, dans `%APPDATA%\Simply Hub\spotify.json`.

Windows SmartScreen peut afficher « Windows a protégé votre ordinateur », parce que l'appli n'est pas signée.
Clique sur **Informations complémentaires → Exécuter quand même**.

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
