# Cine-Sync — Plan de fix + Guide cross-platform

---

## 1. Fix : mpv crash code=1

### Problème
mpv quitte immédiatement avec `code=1` quand on force `--vo=gpu --gpu-api=d3d11`.
Ça arrive avec **tous** les types de HWND Electron (BrowserWindow et BaseWindow).
Le swap chain D3D11 que mpv essaie de créer est incompatible avec les HWNDs Electron.

### Ce qui marchait
L'approche **deux BrowserWindows + `app.disableHardwareAcceleration()`** sans forcer le VO :
- `videoWin` = BrowserWindow opaque (charge `about:blank`, mpv rend dedans via `--wid`)
- `mainWin` = BrowserWindow transparent (overlay React UI par-dessus)
- mpv auto-détecte le meilleur VO disponible → vidéo + son ✓

### Fichiers à modifier

#### `src/main/index.ts`
```diff
- import { app, BaseWindow, BrowserWindow, ... } from 'electron'
+ import { app, BrowserWindow, ... } from 'electron'

  app.disableHardwareAcceleration()  // GARDER — essentiel

- const videoWin = new BaseWindow({
+ const videoWin = new BrowserWindow({
    width: 1280,
    height: 720,
    frame: false,
    show: false,
    backgroundColor: '#000000',
    title: 'LecteurFilm',
+   webPreferences: { nodeIntegration: false, contextIsolation: true },
  })
+ videoWin.loadURL('about:blank')
```

#### `src/main/window.ts`
```diff
- import { BaseWindow } from 'electron'
- export function getHwnd(win: BaseWindow): string {
+ import { BrowserWindow } from 'electron'
+ export function getHwnd(win: BrowserWindow): string {
```

#### `src/main/mpv/MpvProcess.ts`
```diff
  const args = [
    `--wid=${hwnd}`,
    `--input-ipc-server=\\\\.\\pipe\\mpvsocket`,
    ...
-   '--vo=gpu',
-   '--gpu-api=d3d11',
    '--hwdec=auto-safe',           // hardware decoding (toujours actif)
    '--scale=ewa_lanczossharp',    // appliqué si vo=gpu auto-détecté
    '--deband',                    // idem
    ...
+   '--msg-level=all=status',      // log le VO sélectionné dans stderr
  ]
```

### Qualité vidéo — est-ce dégradé ?
| Feature | Avec `--vo=gpu` forcé | Sans (auto-détect) |
|---------|----------------------|-------------------|
| Hardware decoding 4K | ✓ | ✓ (identique) |
| Résolution native | ✓ | ✓ (identique) |
| Scaling ewa_lanczos | ✓ | ✓ si mpv choisit vo=gpu, sinon ignoré |
| Deband | ✓ | idem |
| HDR tone mapping | ✓ | partiel selon VO |
| **Qualité brute du décodage** | **identique** | **identique** |

Le décodage hardware (`--hwdec=auto-safe`) est indépendant du VO.
La qualité du fichier source est toujours préservée à 100%.

### Vérification après fix
```bash
npm run dev
# 1. Ouvrir un fichier vidéo
# 2. Vérifier dans le terminal : pas de "code=1"
# 3. Chercher "[mpv stderr]" pour voir le VO auto-détecté
# 4. Tester : Espace = pause, ← → = seek, boutons ─ □ ✕
```

---

## 2. Reprendre le projet sur un autre PC

### Windows (identique)
```bash
git clone https://github.com/goulue5/Cine-Sync.git
cd Cine-Sync
npm install

# Télécharger mpv.exe (build shinchiro 64-bit)
# https://sourceforge.net/projects/mpv-player-windows/files/
# Extraire mpv.exe → resources/mpv/mpv.exe

npm run dev
```

### macOS — Adaptations nécessaires

Le code actuel est **Windows-only**. Pour macOS il faut adapter 3 choses :

#### A. mpv binaire
```bash
# Installer mpv via Homebrew
brew install mpv

# Le binaire est à /usr/local/bin/mpv (Intel) ou /opt/homebrew/bin/mpv (Apple Silicon)
```

Modifier `MpvProcess.ts` :
```typescript
private _resolveMpvPath(): string {
  if (process.platform === 'darwin') {
    // Chercher mpv dans PATH ou Homebrew
    return '/opt/homebrew/bin/mpv'  // Apple Silicon
    // ou '/usr/local/bin/mpv'      // Intel
  }
  // ... Windows path existant
}
```

#### B. IPC Socket (named pipe → Unix domain socket)
```diff
  // MpvProcess.ts — args
- `--input-ipc-server=\\\\.\\pipe\\mpvsocket`,
+ `--input-ipc-server=/tmp/mpvsocket`,

  // MpvIpcClient.ts — connexion
- const PIPE_PATH = '\\\\.\\pipe\\mpvsocket'
+ const PIPE_PATH = process.platform === 'win32'
+   ? '\\\\.\\pipe\\mpvsocket'
+   : '/tmp/mpvsocket'
```

Node.js `net.createConnection()` fonctionne avec les deux (named pipe Windows + Unix socket macOS).

#### C. Embedding vidéo (HWND → NSView)
C'est le changement le plus important. Sur macOS :

- `getNativeWindowHandle()` retourne un `NSView*` (pas un HWND)
- mpv sur macOS utilise `--wid=<NSView pointer>` mais c'est instable
- L'approche recommandée sur macOS : **ne pas utiliser `--wid`**, laisser mpv créer sa propre fenêtre et gérer la position

Alternative macOS : utiliser **libmpv** avec le render API (nécessite `mpv.framework` ou N-API bindings).

#### D. `disableHardwareAcceleration()` sur macOS
Sur macOS, `disableHardwareAcceleration()` force Core Animation software rendering.
Tester si c'est nécessaire — possible que macOS n'ait pas le même conflit DComp que Windows.

### Résumé cross-platform

| Composant | Windows | macOS |
|-----------|---------|-------|
| mpv binaire | `resources/mpv/mpv.exe` | `brew install mpv` |
| IPC | Named pipe `\\.\pipe\mpvsocket` | Unix socket `/tmp/mpvsocket` |
| Embedding | `--wid=<HWND>` + deux fenêtres | `--wid=<NSView>` ou fenêtre séparée |
| HW accel | `disableHardwareAcceleration()` requis | À tester |
| Qualité | `--hwdec=auto-safe` D3D11 | `--hwdec=auto-safe` VideoToolbox |

### Linux (bonus)
```bash
# mpv
sudo apt install mpv  # ou pacman -S mpv

# IPC : Unix socket (comme macOS)
# Embedding : --wid=<X11 Window ID> ou --wid=<Wayland surface>
# Généralement plus simple que Windows
```

---

## Architecture actuelle (rappel)

```
videoWin (BrowserWindow, opaque, about:blank)
  └── mpv child window (D3D11 auto) → rendu vidéo

mainWin (BrowserWindow, transparent: true)
  └── React UI overlay
  └── setParentWindow(videoWin) → toujours au-dessus

app.disableHardwareAcceleration()
  → Chromium software rendering
  → mpv D3D11 child window visible par-dessus GDI
```
