const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onNowPlayingUpdate: (callback) => {
        ipcRenderer.removeAllListeners('now-playing-update');
        ipcRenderer.on('now-playing-update', (event, value) => callback(value));
    },
    toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
    mediaControl: (action) => ipcRenderer.send('media-control', action),
    googleCalendarAuth: (clientId, clientSecret) => ipcRenderer.send('google-calendar-auth', { clientId, clientSecret }),
    getCalendarTokens: () => ipcRenderer.invoke('get-calendar-tokens'),
    clearCalendarTokens: () => ipcRenderer.invoke('clear-calendar-tokens'),
    onCalendarAuthSuccess: (callback) => {
        ipcRenderer.removeAllListeners('calendar-auth-success');
        ipcRenderer.on('calendar-auth-success', (event, val) => callback(val));
    },
    getObsidianPath: () => ipcRenderer.invoke('get-obsidian-path'),
    setObsidianPath: (path) => ipcRenderer.invoke('set-obsidian-path', path),
    readObsidianNote: () => ipcRenderer.invoke('read-obsidian-note'),
    writeObsidianNote: (text) => ipcRenderer.invoke('write-obsidian-note', text),
    getObsidianGraph: () => ipcRenderer.invoke('get-obsidian-graph'),
    
    // Cronjob Manager
    getCronjobs: () => ipcRenderer.invoke('get-cronjobs'),
    getConfig: () => ipcRenderer.invoke('get-config'),
    setConfig: (key, value) => ipcRenderer.send('set-config', key, value),
    saveCronjob: (job) => ipcRenderer.invoke('save-cronjob', job),
    deleteCronjob: (jobId) => ipcRenderer.invoke('delete-cronjob', jobId),
    
    onObsidianNoteChanged: (callback) => {
        ipcRenderer.removeAllListeners('obsidian-note-changed');
        ipcRenderer.on('obsidian-note-changed', (event, text) => callback(text));
    },
    onExecuteIntent: (callback) => {
        ipcRenderer.removeAllListeners('execute-intent');
        ipcRenderer.on('execute-intent', (event, intent) => callback(intent));
    },
    onExternalNoteAdded: (callback) => {
        ipcRenderer.removeAllListeners('external-note-added');
        ipcRenderer.on('external-note-added', (event, text) => callback(text));
    },
    onExternalCommandReceived: (callback) => {
        ipcRenderer.removeAllListeners('external-command-received');
        ipcRenderer.on('external-command-received', (event, value) => callback(value));
    },
    onExternalMediaReceived: (callback) => {
        ipcRenderer.removeAllListeners('external-media-received');
        ipcRenderer.on('external-media-received', (event, value) => callback(value));
    },
    sendTelegramReply: (chatId, text) => ipcRenderer.send('send-telegram-reply', { chatId, text }),
    sendConsoleLog: (type, message) => ipcRenderer.send('console-log', { type, message }),
    updateTelegramToken: (token) => ipcRenderer.send('update-telegram-token', token),
    isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),
    openExternal: (url) => ipcRenderer.send('open-external', url),
    
    // Bambu Lab
    setBambuConfig: (config) => ipcRenderer.send('set-bambu-config', config),
    getBambuStatus: () => ipcRenderer.invoke('get-bambu-status'),
    sendBambuCommand: (command) => ipcRenderer.invoke('send-bambu-command', command),
    
    // PC Stats
    getSystemStats: () => ipcRenderer.invoke('get-system-stats')
});
