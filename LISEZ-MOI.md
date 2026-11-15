# PoseyHub — par PoseyDevs

**YouTube, Discord et Spotify dans une seule appli Windows.**
C'est une vraie appli de bureau (.exe) avec sa propre fenêtre. Pas besoin d'ouvrir un navigateur.

**Télécharger l'appli toute prête : https://angelotkkt.github.io/PoseyHub/**
Chaque modification envoyée sur GitHub fabrique automatiquement un nouveau `.exe`. Les PoseyHub déjà installés se mettent à jour tout seuls.
La suite de ce fichier explique comment fabriquer l'appli toi-même sur ton PC.

---

## Créer le .exe (une seule fois)

1. Installe **Node.js** (version **LTS**) depuis https://nodejs.org si tu ne l'as pas déjà.
2. Dézippe le dossier `PoseyHub`.
3. Double-clique sur **`CREER-LE-EXE.bat`**.
4. Attends quelques minutes. Le dossier `dist` s'ouvre ensuite tout seul avec :
   - **`PoseyHub-portable.exe`** : se lance directement, sans installation (tu peux le mettre sur une clé USB).
   - **`PoseyHub-Setup.exe`** : installe l'appli avec un raccourci sur le bureau et dans le menu Démarrer.

> Pour essayer l'appli avant de créer le .exe : `TESTER-SANS-COMPILER.bat`.

---

## Spotify : connexion officielle

L'onglet Spotify n'affiche pas le site de Spotify. C'est un **lecteur PoseyHub** relié à ton compte par la **connexion officielle de Spotify** (Spotify for Developers / Web API).
À la première ouverture, l'onglet t'explique tout, étape par étape :

1. Sur https://developer.spotify.com/dashboard, clique sur **Create app**.
2. Redirect URI : `http://127.0.0.1:47823/callback`. Coche **Web API** et **Web Playback SDK**, puis enregistre.
3. Colle le **Client ID** dans PoseyHub, puis clique sur **Se connecter avec Spotify**. La page de connexion officielle s'ouvre dans ton navigateur. Tu acceptes, et c'est fini.

Ce que tu peux faire ensuite :
- **Pages :** accueil (écoutés récemment, tes playlists, tes titres du moment), recherche, bibliothèque, playlists, albums et artistes.
- **Lecture :** play/pause, suivant, précédent, aléatoire, répétition, avancer dans le titre, volume, et bouton ♥ pour liker un titre.
- **Choix de l'appareil** (Spotify Connect) : PoseyHub lui-même, l'**appli Spotify officielle** sur ton PC, ton téléphone, une enceinte…
- **Depuis l'icône près de l'horloge :** lecture/pause, suivant, précédent.

**Règles de Spotify à connaître :**
- Le compte qui crée l'appli sur Spotify for Developers doit avoir **Spotify Premium**.
- **5 comptes maximum** peuvent utiliser ton Client ID. Pour un autre compte que le tien, ajoute son e-mail dans *User Management* de ton appli Spotify for Developers.
- Pour contrôler la lecture, il faut aussi Premium.
- Pour les playlists que tu suis sans les avoir créées, Spotify ne donne pas la liste des titres. Tu peux quand même les lancer.

**Si « Lecteur PoseyHub indisponible » s'affiche :** le lecteur intégré de Spotify n'est pas officiellement prévu pour les applis de bureau, donc il peut parfois refuser de marcher.
Dans ce cas, clique sur l'appareil en bas à droite, puis sur **Ouvrir l'appli Spotify officielle**, et choisis-la. PoseyHub la pilote alors à distance.

Les identifiants de connexion sont chiffrés avec le coffre de Windows, dans `%APPDATA%\PoseyHub\spotify.json`.

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
| `Ctrl+1` / `Ctrl+2` / `Ctrl+3` | YouTube / Discord / Spotify |
| `Ctrl+Tab` | Service suivant |
| `Ctrl+R` ou `F5` | Actualiser |
| `Alt+←` / `Alt+→` | Page précédente / suivante |
| `F11` | Plein écran |
| `Ctrl+Shift+I` | Outils de développement |

---

## Problèmes possibles

### Le lecteur intégré PoseyHub ne lit pas la musique
Le lecteur intégré utilise une protection anti-copie appelée Widevine. PoseyHub utilise la version d'Electron de **castLabs**, qui la contient.
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
Clic droit sur l'icône près de l'horloge → **Quitter PoseyHub**.
Tu peux aussi décocher « Garder ouvert dans la zone de notification » dans ⚙️ Réglages.

---

## Personnaliser

Tout se règle dans `src/main.js` :
- **Ajouter un service** (Twitch, WhatsApp, Netflix…) : ajoute une ligne dans la liste `SERVICES` en haut du fichier.
  L'icône s'ajoute dans `ICONS` dans `src/index.html`.
- **Changer l'icône de l'appli** : remplace `assets/icon.png` (512×512) et `assets/tray.png` (32×32).
  Tu peux y mettre ton logo PoseyDevs.
- **Changer le nom ou la version** : `productName` et `version` dans `package.json`.

Les données de l'appli (connexions, réglages) sont stockées dans `%APPDATA%\PoseyHub`.
