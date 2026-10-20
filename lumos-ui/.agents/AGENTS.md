# Lumos Workspace Rules

## Technology Constraints
1. **Frontend:** React + Vite. HMR (Hot Module Replacement) handles changes in `.jsx` and `.css` instantly.
2. **Backend:** Node.js + Electron. Uses `nodemon` to hot-reload changes in `main.js` and `preload.cjs`.
3. **Styling:** Vanilla CSS (`src/index.css`) with Nier Automata inspired aesthetics.

## Audio & Microphone Architecture Rules
1. **Concurrent Microphone Locks:** Chromium on Windows may deadlock if multiple functions call `navigator.mediaDevices.getUserMedia` or instantiate `new SpeechRecognition()` in the exact same millisecond on application mount. Never request multiple permissions concurrently. Instead, serialize them or share the stream.
2. **AudioContext Resuming:** Browsers block AudioContext operations until a user gesture. Ensure `audioCtxRef.current.resume()` is triggered inside `onClick` handlers (e.g. background click or settings gear click) to activate visualizer and input level meters.
3. **Electron Permissions:** Always ensure `session.defaultSession.setPermissionRequestHandler` automatically approves `'media'` and `'audioCapture'` in `main.js` BEFORE `mainWindow.loadURL` is executed.

## UI Patterns
1. **Frameless Window:** The electron wrapper is frameless. Handle window dragging via specific CSS regions (`-webkit-app-region: drag`) and prevent dragging on interactive elements (`no-drag`).
2. **Double-Click Background:** Single-clicks to the background handle unfocusing. Background clicks query the `isFullscreen` IPC bridge to ONLY ENTER fullscreen. Users must press F11 to exit fullscreen.
