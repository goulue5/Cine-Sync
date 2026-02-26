# LecteurFilm

Lecteur vidéo desktop Windows basé sur mpv, avec une interface React/Electron.

## Télécharger (utilisateurs)

👉 **[Releases GitHub](../../releases)** — télécharger `LecteurFilm-portable-x.x.x.exe`

Aucune installation requise. Glisser un fichier MKV/MP4 sur la fenêtre pour lancer la lecture.

---

## Développer (contributeurs)

### 1. Prérequis

- Node.js 20+
- mpv.exe (build Windows 64-bit de shinchiro)

### 2. Obtenir mpv.exe

1. Aller sur https://sourceforge.net/projects/mpv-player-windows/files/
2. Télécharger le dernier build `mpv-x86_64-*.7z`
3. Extraire `mpv.exe` → placer dans `resources/mpv/mpv.exe`

### 3. Installer et lancer

```bash
npm install
npm run dev
```

### 4. Builder un .exe distribuable

```bash
# Installer mpv.exe dans resources/mpv/ d'abord
npm run dist
# → dist/LecteurFilm Setup x.x.x.exe  (installeur NSIS)
# → dist/LecteurFilm-portable-x.x.x.exe  (portable, pas d'install)
```

---

## Stack

| Couche | Outil |
|--------|-------|
| Build | electron-vite |
| Runtime | Electron 34 |
| UI | React 19 + TypeScript |
| Style | Tailwind CSS v4 |
| State | Zustand |
| Vidéo | mpv.exe (wid + named pipe IPC) |
