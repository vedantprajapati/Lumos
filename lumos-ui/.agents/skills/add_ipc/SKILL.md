---
name: add_ipc
description: Instructions for adding new backend node.js functionality via Electron IPC in Lumos.
---

# Adding IPC Handlers to Lumos

When the user asks for new backend functionality (like reading files, calling a system API, or executing terminal commands), you must implement an IPC bridge between the React frontend and the Electron backend.

## 1. Backend (`main.js`)
Register the handler in `main.js`. 
- Use `ipcMain.handle` if the frontend expects a response back (Promise).
- Use `ipcMain.on` if it's a fire-and-forget signal.

```javascript
// Example in main.js
ipcMain.handle('your-channel-name', async (event, args) => {
    try {
        // Do backend stuff
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});
```

## 2. Preload Bridge (`preload.cjs`)
You MUST explicitly expose the channel in `preload.cjs` inside the `contextBridge`. Do NOT use `contextIsolation: false` or expose `ipcRenderer` directly.

```javascript
// Example in preload.cjs
contextBridge.exposeInMainWorld('electronAPI', {
    ...existingMethods,
    yourMethodName: (args) => ipcRenderer.invoke('your-channel-name', args)
});
```

## 3. Frontend Invocation (`App.jsx`)
Call the method via the `window.electronAPI` object. 

```javascript
const result = await window.electronAPI.yourMethodName(data);
```
