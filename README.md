# Cine-Sync

Lecteur video desktop open source avec Watch Together integre.

![macOS](https://img.shields.io/badge/macOS-supported-green)
![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- Lecture video (MP4, MKV, WebM, AVI, MOV + fallback ffmpeg pour ProRes et codecs exotiques)
- Watch Together en LAN ou en ligne (rooms avec code, chat, sync play/pause/seek)
- Sous-titres externes (SRT, VTT) par drag & drop ou chargement manuel
- Filtres video (luminosite, contraste, saturation, gamma)
- Picture-in-Picture
- 8 themes de couleur
- Reprise de lecture automatique
- Historique des fichiers recents
- Drag & drop
- Raccourcis clavier complets

## Plateforme

Pour le moment, Cine-Sync est developpe et teste sur **macOS** uniquement. Le support Windows et Linux est prevu mais pas encore teste.

## Installer

### macOS

```bash
npm install
npm run dist:mac
```

Le fichier `.dmg` est genere dans `dist/`. Ouvrir le DMG et glisser l'app dans Applications.

## Developper

### Prerequis

- Node.js 20+
- ffmpeg (optionnel, pour les codecs non supportes nativement)

```bash
# macOS
brew install ffmpeg
```

### Lancer en dev

```bash
npm install
npm run dev
```

### Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| Espace | Play / Pause |
| Fleches gauche/droite | Reculer / Avancer 5s (Shift: 30s) |
| Fleches haut/bas | Volume |
| M | Couper / Activer le son |
| F | Plein ecran |
| W | Watch Together |
| S | Recherche sous-titres |
| I | Infos media |
| Alt+P | Picture-in-Picture |
| N / P | Fichier suivant / precedent |

## Watch Together

### En LAN (meme WiFi)

1. Cliquer Watch Together > Creer > Reseau local
2. Partager l'adresse IP affichee
3. L'autre personne entre l'adresse dans "Rejoindre"

### En ligne (a distance)

1. Deployer le serveur relais (`relay-server/server.ts`) sur Deno Deploy
2. Creer une room > copier le code
3. L'autre personne entre le code dans "Rejoindre"

## Stack

| Couche | Outil |
|--------|-------|
| Build | electron-vite |
| Runtime | Electron 34 |
| UI | React 19 + TypeScript |
| Style | Tailwind CSS v4 |
| State | Zustand |
| Video | HTML5 `<video>` + ffmpeg fallback |
| Sync | WebSocket (ws) |

## Licence

MIT - voir [LICENSE](LICENSE)
