import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { exec, spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import url from 'url';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logFilePath = path.join(__dirname, 'lumos.log');
try {
    fs.writeFileSync(logFilePath, `--- Lumos Application Log Started at ${new Date().toISOString()} ---\n`);
} catch (e) {
    console.error("Failed to init log file:", e);
}

process.on('uncaughtException', (err) => {
    try {
        fs.appendFileSync(logFilePath, `[${new Date().toISOString()}] [MAIN] [UNCAUGHT_ERROR] ${err.stack || err}\n`);
    } catch (e) {}
});

ipcMain.on('console-log', (event, { type, message }) => {
    try {
        const logLine = `[${new Date().toISOString()}] [RENDERER] [${type.toUpperCase()}] ${message}\n`;
        fs.appendFileSync(logFilePath, logLine);
    } catch (e) {}
});

// Setup Local Express API Server for Webhooks (Google Home / IFTTT)
const expressApp = express();
expressApp.use(cors());
expressApp.use(express.json());

expressApp.post('/api/command', (req, res) => {
    const { action, data } = req.body;
    if (mainWindow && action) {
        mainWindow.webContents.send('execute-intent', { action, data });
        res.json({ success: true, message: `Command ${action} forwarded to Lumos.` });
    } else {
        res.status(400).json({ success: false, message: 'Invalid payload or mainWindow not ready.' });
    }
});

expressApp.listen(3000, () => {
    console.log('Lumos Webhook Server listening on port 3000');
});

let mainWindow;
let mediaTimer;

function saveWindowState() {
    if (!mainWindow) return;
    try {
        const bounds = mainWindow.getBounds();
        const state = {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            isFullScreen: mainWindow.isFullScreen()
        };
        fs.writeFileSync(path.join(__dirname, 'window-state.json'), JSON.stringify(state));
    } catch (e) {
        console.error("Failed to save window state:", e);
    }
}

const configPath = path.join(__dirname, 'config.json');

function getConfig() {
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (e) {
        console.error("Failed to read config:", e);
    }
    return {};
}

function setConfigKey(key, value) {
    const config = getConfig();
    config[key] = value;
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch (e) {
        console.error("Failed to write config:", e);
    }
}

ipcMain.handle('get-config', () => getConfig());
ipcMain.on('set-config', (event, key, value) => setConfigKey(key, value));

function createWindow() {
    let windowState = {
        width: 1024,
        height: 768,
        x: undefined,
        y: undefined,
        isFullScreen: false
    };

    const statePath = path.join(__dirname, 'window-state.json');
    try {
        if (fs.existsSync(statePath)) {
            windowState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        }
    } catch (e) {
        console.error("Failed to read window state:", e);
    }

    mainWindow = new BrowserWindow({
        title: 'Lumos',
        width: windowState.width,
        height: windowState.height,
        x: windowState.x,
        y: windowState.y,
        frame: false, // Frameless window
        backgroundColor: '#000000',
        maximizable: false, // Disable default OS double-click maximize behavior
        icon: path.join(__dirname, 'icon.ico'), // Sets the taskbar and Alt+Tab window icon
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    if (windowState.isFullScreen) {
        mainWindow.setFullScreen(true);
    }

    // Auto-approve microphone/system audio capture permissions
    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
        if (permission === 'media' || permission === 'audioCapture' || permission === 'videoCapture') return true;
        return false;
    });

    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'media' || permission === 'audioCapture' || permission === 'videoCapture') {
            callback(true);
        } else {
            callback(false);
        }
    });

    mainWindow.loadURL('http://localhost:5173');

    // Backend verification test for enumerateDevices
    mainWindow.webContents.on('did-finish-load', () => {
        setTimeout(() => {
            mainWindow.webContents.executeJavaScript(`
                navigator.mediaDevices.enumerateDevices()
                    .then(devices => devices.map(d => ({kind: d.kind, label: d.label})))
            `).then(devices => {
                fs.appendFileSync('lumos.log', '\\n[BACKEND-TEST] ' + JSON.stringify(devices) + '\\n');
            }).catch(e => {
                fs.appendFileSync('lumos.log', '\\n[BACKEND-TEST-ERROR] ' + String(e) + '\\n');
            });
        }, 5000);
    });

    // Save window state on adjustments
    mainWindow.on('resize', saveWindowState);
    mainWindow.on('move', saveWindowState);
    mainWindow.on('enter-full-screen', saveWindowState);
    mainWindow.on('leave-full-screen', saveWindowState);

    mainWindow.on('closed', () => {
        mainWindow = null;
        clearInterval(mediaTimer);
    });

    // Start checking media session
    startMediaMonitoring();
}

let mediaProcess;
function startMediaMonitoring() {
    const psScriptPath = path.join(__dirname, 'get_media.ps1');
    
    if (mediaProcess) {
        mediaProcess.kill();
    }
    
    mediaProcess = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', psScriptPath]);
    
    let buffer = '';
    mediaProcess.stdout.on('data', (data) => {
        buffer += data.toString();
        
        // Try to parse full JSON objects from the buffer
        let tryAgain = true;
        while (tryAgain) {
            tryAgain = false;
            const startIdx = buffer.indexOf('{');
            const endIdx = buffer.indexOf('}', startIdx);
            
            if (startIdx !== -1 && endIdx !== -1) {
                const jsonStr = buffer.substring(startIdx, endIdx + 1);
                buffer = buffer.substring(endIdx + 1); // remove parsed chunk
                
                try {
                    const parsedData = JSON.parse(jsonStr);
                    if (mainWindow) {
                        mainWindow.webContents.send('now-playing-update', parsedData);
                    }
                    tryAgain = true; // continue parsing if multiple objects arrived together
                } catch (e) {
                    // ignore parse errors for partial/corrupted chunks
                }
            }
        }
    });

    mediaProcess.stderr.on('data', (data) => {
        console.error("PS execute error:", data.toString());
    });
    
    mediaProcess.on('close', (code) => {
        console.log(`Media monitoring process exited with code ${code}. Restarting in 5s...`);
        mediaTimer = setTimeout(startMediaMonitoring, 5000);
    });
}

ipcMain.on('media-control', (event, action) => {
    let keycode;
    if (action === 'play-pause') keycode = 179;
    else if (action === 'volume-up') keycode = 175;
    else if (action === 'volume-down') keycode = 174;
    else if (action === 'next') keycode = 176;
    else if (action === 'prev') keycode = 177;

    if (keycode) {
        exec(`powershell -Command "$wsh = New-Object -ComObject Wscript.Shell; $wsh.SendKeys([char]${keycode})"`, (err) => {
            if (err) console.error("Media control error:", err);
        });
    }
});

ipcMain.on('toggle-fullscreen', () => {
    if (mainWindow) {
        const isFullScreen = mainWindow.isFullScreen();
        mainWindow.setFullScreen(!isFullScreen);
    }
});

ipcMain.handle('is-fullscreen', () => {
    return mainWindow ? mainWindow.isFullScreen() : false;
});

ipcMain.on('open-external', (event, url) => {
    const { shell } = require('electron');
    shell.openExternal(url);
});

let telegramTimeout;
let lastUpdateId = 0;
let telegramBotToken = '';
let isPolling = false;

function sendTelegramMessage(chatId, text) {
    if (!telegramBotToken) return;
    const url = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
    const payload = JSON.stringify({
        chat_id: chatId,
        text: text
    });

    const req = https.request(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    }, (res) => {});

    req.on('error', (e) => {
        console.error("Failed to send Telegram message:", e);
    });

    req.write(payload);
    req.end();
}

function downloadTelegramFile(fileId, mimeType, chatId) {
    if (!telegramBotToken) return;

    const getFileUrl = `https://api.telegram.org/bot${telegramBotToken}/getFile?file_id=${fileId}`;
    
    https.get(getFileUrl, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (response.ok && response.result && response.result.file_path) {
                    const filePath = response.result.file_path;
                    const downloadUrl = `https://api.telegram.org/file/bot${telegramBotToken}/${filePath}`;
                    
                    https.get(downloadUrl, (fileRes) => {
                        const chunks = [];
                        fileRes.on('data', chunk => chunks.push(chunk));
                        fileRes.on('end', () => {
                            const buffer = Buffer.concat(chunks);
                            const base64 = buffer.toString('base64');
                            console.log(`Telegram media downloaded successfully. Mime: ${mimeType}, Size: ${buffer.length}`);
                            
                            if (mainWindow) {
                                mainWindow.webContents.send('external-media-received', {
                                    base64Data: base64,
                                    mimeType: mimeType,
                                    chatId: chatId
                                });
                            }
                        });
                    }).on('error', (err) => {
                        console.error("Error downloading file buffer from Telegram:", err);
                        sendTelegramMessage(chatId, "Lumos: Failed to download the sent media file.");
                    });
                }
            } catch (e) {
                console.error("Error parsing getFile response:", e);
                sendTelegramMessage(chatId, "Lumos: Could not retrieve file details from Telegram API.");
            }
        });
    }).on('error', (err) => {
        console.error("Error calling getFile API:", err);
    });
}

function pollTelegram() {
    if (!telegramBotToken) {
        isPolling = false;
        return;
    }
    isPolling = true;

    const url = `https://api.telegram.org/bot${telegramBotToken}/getUpdates?offset=${lastUpdateId}&timeout=30`;
    
    const req = https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (response.ok && response.result.length > 0) {
                    response.result.forEach(update => {
                        lastUpdateId = Math.max(lastUpdateId, update.update_id + 1);
                        
                        const message = update.message;
                        if (!message) return;
                        
                        const chatId = message.chat.id;

                        // Check for voice, audio, video, video note, or documents
                        if (message.voice) {
                            console.log(`Telegram voice received from ${chatId}`);
                            downloadTelegramFile(message.voice.file_id, message.voice.mime_type || 'audio/ogg', chatId);
                        } else if (message.audio) {
                            console.log(`Telegram audio received from ${chatId}`);
                            downloadTelegramFile(message.audio.file_id, message.audio.mime_type || 'audio/mp3', chatId);
                        } else if (message.video) {
                            console.log(`Telegram video received from ${chatId}`);
                            downloadTelegramFile(message.video.file_id, message.video.mime_type || 'video/mp4', chatId);
                        } else if (message.video_note) {
                            console.log(`Telegram video note received from ${chatId}`);
                            downloadTelegramFile(message.video_note.file_id, 'video/mp4', chatId);
                        } else if (message.text) {
                            const text = message.text.trim();
                            console.log(`Telegram text received from ${chatId}:`, text);
                            
                            if (text.startsWith('/start')) {
                                sendTelegramMessage(chatId, "Hello! I am Lumos. You can send me commands, voice notes, or video messages to manage your notepad and calendar, or just ask me questions!");
                            } else if (mainWindow) {
                                mainWindow.webContents.send('external-command-received', { text, chatId });
                            }
                        }
                    });
                }
            } catch (e) {
                console.error("Error parsing Telegram updates:", e);
            }
            
            // Poll again immediately
            telegramTimeout = setTimeout(pollTelegram, 1000);
        });
    });

    req.on('error', (e) => {
        console.error("Telegram polling network error:", e);
        // Retry in 10 seconds on network failure
        telegramTimeout = setTimeout(pollTelegram, 10000);
    });
}

function startTelegramPolling(token) {
    if (telegramBotToken === token && isPolling) {
        console.log("Telegram polling already running for this token.");
        return;
    }
    
    telegramBotToken = token;
    if (telegramTimeout) {
        clearTimeout(telegramTimeout);
    }
    if (telegramBotToken) {
        console.log("Starting Telegram Bot updates polling...");
        pollTelegram();
    } else {
        isPolling = false;
        console.log("Telegram Bot token cleared. Stopping updates polling...");
    }
}

ipcMain.on('update-telegram-token', (event, token) => {
    startTelegramPolling(token);
});

ipcMain.on('send-telegram-reply', (event, { chatId, text }) => {
    sendTelegramMessage(chatId, `Lumos: ${text}`);
});

let webhookServer;

function startWebhookServer() {
    webhookServer = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        const parsedUrl = url.parse(req.url, true);
        if (req.method === 'POST' && parsedUrl.pathname === '/api/note') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    if (data.text) {
                        if (mainWindow) {
                            mainWindow.webContents.send('external-note-added', data.text);
                        }
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ status: 'success', message: 'Note added successfully' }));
                    } else {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ status: 'error', message: 'Missing "text" field' }));
                    }
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'error', message: 'Invalid JSON payload' }));
                }
            });
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'error', message: 'Not Found' }));
        }
    });

    webhookServer.listen(8086, '0.0.0.0', () => {
        console.log('Webhook server listening on port 8086');
    });
}

// Google Calendar OAuth helper
ipcMain.on('google-calendar-auth', (event, { clientId, clientSecret }) => {
    let oauthServer = http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url, true);
        const query = parsedUrl.query;
        
        if (query.code) {
            const tokenUrl = 'https://oauth2.googleapis.com/token';
            const params = new URLSearchParams({
                code: query.code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: 'http://localhost:8085',
                grant_type: 'authorization_code'
            });

            fetch(tokenUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString()
            })
            .then(response => response.json())
            .then(data => {
                if (data.access_token) {
                    const tokens = {
                        clientId,
                        clientSecret,
                        accessToken: data.access_token,
                        refreshToken: data.refresh_token,
                        expiryDate: Date.now() + (data.expires_in * 1000)
                    };
                    fs.writeFileSync(path.join(__dirname, 'calendar-tokens.json'), JSON.stringify(tokens, null, 4));
                    
                    if (mainWindow) {
                        mainWindow.webContents.send('calendar-auth-success', true);
                    }
                    
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end('<h1>Authentication Successful!</h1><p>You can close this tab and return to Projector Notepad.</p>');
                } else {
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end(`<h1>Authentication Failed!</h1><p>${data.error_description || 'Unknown error'}</p>`);
                }
                
                setTimeout(() => { oauthServer.close(); }, 1000);
            })
            .catch(err => {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end(`<h1>Server Error</h1><p>${err.message}</p>`);
                setTimeout(() => { oauthServer.close(); }, 1000);
            });
        } else {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>Missing Code</h1><p>No authorization code found in redirect.</p>');
            setTimeout(() => { oauthServer.close(); }, 1000);
        }
    });

    oauthServer.listen(8085, () => {
        console.log('OAuth helper server listening on port 8085');
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=http://localhost:8085&response_type=code&scope=https://www.googleapis.com/auth/calendar.readonly&access_type=offline&prompt=consent`;
        import('electron').then(({ shell }) => {
            shell.openExternal(authUrl);
        });
    });
});

// Fetch active tokens, automatically refreshing if expired
ipcMain.handle('get-calendar-tokens', async () => {
    const tokenPath = path.join(__dirname, 'calendar-tokens.json');
    if (!fs.existsSync(tokenPath)) {
        return null;
    }
    
    try {
        let tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
        
        // Refresh token if it will expire within 60 seconds
        if (Date.now() >= (tokens.expiryDate - 60000)) {
            console.log("Access token expired/expiring soon. Refreshing...");
            const tokenUrl = 'https://oauth2.googleapis.com/token';
            const params = new URLSearchParams({
                client_id: tokens.clientId,
                client_secret: tokens.clientSecret,
                refresh_token: tokens.refreshToken,
                grant_type: 'refresh_token'
            });
            
            const response = await fetch(tokenUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString()
            });
            
            const data = await response.json();
            if (data.access_token) {
                tokens.accessToken = data.access_token;
                tokens.expiryDate = Date.now() + (data.expires_in * 1000);
                if (data.refresh_token) {
                    tokens.refreshToken = data.refresh_token;
                }
                fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 4));
                console.log("Token successfully refreshed!");
            } else {
                console.error("Token refresh failed:", data);
                return null;
            }
        }
        
        return {
            accessToken: tokens.accessToken
        };
    } catch (e) {
        console.error("Error reading/refreshing tokens:", e);
        return null;
    }
});

// Clear credentials
ipcMain.handle('clear-calendar-tokens', async () => {
    const tokenPath = path.join(__dirname, 'calendar-tokens.json');
    if (fs.existsSync(tokenPath)) {
        try {
            fs.unlinkSync(tokenPath);
            return true;
        } catch (e) {
            console.error("Failed to delete token file:", e);
            return false;
        }
    }
    return true;
});

// Obsidian integration
let obsidianWatcher = null;
const obsidianConfigPath = path.join(__dirname, 'obsidian-config.json');

ipcMain.handle('get-obsidian-path', () => {
    if (fs.existsSync(obsidianConfigPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(obsidianConfigPath, 'utf8'));
            return config.path || null;
        } catch (e) {
            return null;
        }
    }
    return null;
});

ipcMain.handle('set-obsidian-path', (event, filePath) => {
    try {
        fs.writeFileSync(obsidianConfigPath, JSON.stringify({ path: filePath }));
        setupObsidianWatcher(filePath);
        return true;
    } catch (e) {
        console.error("Failed to set Obsidian path:", e);
        return false;
    }
});

// ---------------- CRONJOB MANAGER ----------------
const cronConfigPath = path.join(__dirname, 'cron-config.json');
let activeCronJobs = {}; // { id: cronTask }

function loadCronJobs() {
    if (fs.existsSync(cronConfigPath)) {
        try {
            return JSON.parse(fs.readFileSync(cronConfigPath, 'utf8'));
        } catch (e) {}
    }
    return [];
}

function saveCronJobs(jobs) {
    fs.writeFileSync(cronConfigPath, JSON.stringify(jobs, null, 2));
}

function scheduleJob(job) {
    if (activeCronJobs[job.id]) {
        activeCronJobs[job.id].stop();
        delete activeCronJobs[job.id];
    }
    if (!job.active) return;
    
    try {
        const task = cron.schedule(job.schedule, () => {
            console.log(`Executing Cronjob: ${job.name}`);
            if (mainWindow) {
                mainWindow.webContents.send('execute-intent', { action: 'CRON_TRIGGER', data: { job } });
            }
        });
        activeCronJobs[job.id] = task;
    } catch (e) {
        console.error("Failed to schedule cron job:", e);
    }
}

// Init cron jobs on startup
const savedJobs = loadCronJobs();
savedJobs.forEach(scheduleJob);

ipcMain.handle('get-cronjobs', () => loadCronJobs());

ipcMain.handle('save-cronjob', (event, job) => {
    const jobs = loadCronJobs();
    const existingIdx = jobs.findIndex(j => j.id === job.id);
    if (existingIdx >= 0) {
        jobs[existingIdx] = job;
    } else {
        jobs.push(job);
    }
    saveCronJobs(jobs);
    scheduleJob(job);
    return jobs;
});

ipcMain.handle('delete-cronjob', (event, jobId) => {
    let jobs = loadCronJobs();
    jobs = jobs.filter(j => j.id !== jobId);
    saveCronJobs(jobs);
    if (activeCronJobs[jobId]) {
        activeCronJobs[jobId].stop();
        delete activeCronJobs[jobId];
    }
    return jobs;
});
// -------------------------------------------------

ipcMain.handle('read-obsidian-note', () => {
    if (fs.existsSync(obsidianConfigPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(obsidianConfigPath, 'utf8'));
            if (config.path && fs.existsSync(config.path)) {
                return fs.readFileSync(config.path, 'utf8');
            }
        } catch (e) {
            console.error("Failed to read Obsidian note:", e);
        }
    }
    return null;
});

ipcMain.handle('write-obsidian-note', (event, text) => {
    if (fs.existsSync(obsidianConfigPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(obsidianConfigPath, 'utf8'));
            if (config.path) {
                // Remove the watcher temporarily to avoid echoing back our own write
                if (obsidianWatcher) {
                    obsidianWatcher.close();
                    obsidianWatcher = null;
                }
                fs.writeFileSync(config.path, text, 'utf8');
                // Re-setup the watcher after a brief delay
                setTimeout(() => setupObsidianWatcher(config.path), 100);
                return true;
            }
        } catch (e) {
            console.error("Failed to write Obsidian note:", e);
        }
    }
    return false;
});

function setupObsidianWatcher(filePath) {
    if (obsidianWatcher) {
        obsidianWatcher.close();
        obsidianWatcher = null;
    }
    if (filePath && fs.existsSync(filePath)) {
        obsidianWatcher = fs.watch(filePath, (eventType) => {
            if (eventType === 'change' && mainWindow) {
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    mainWindow.webContents.send('obsidian-note-changed', content);
                } catch (e) {
                    console.error("Failed to read updated Obsidian note:", e);
                }
            }
        });
    }
}

// Initial watcher setup
if (fs.existsSync(obsidianConfigPath)) {
    try {
        const config = JSON.parse(fs.readFileSync(obsidianConfigPath, 'utf8'));
        if (config.path) {
            setupObsidianWatcher(config.path);
        }
} catch (e) {}
}

const walkSync = (dir, filelist = []) => {
    try {
        fs.readdirSync(dir).forEach(file => {
            const filepath = path.join(dir, file);
            if (fs.statSync(filepath).isDirectory()) {
                if (!file.startsWith('.')) {
                    filelist = walkSync(filepath, filelist);
                }
            } else {
                if (file.endsWith('.md')) filelist.push(filepath);
            }
        });
    } catch (e) {}
    return filelist;
};

ipcMain.handle('get-obsidian-graph', () => {
    let vaultDir = null;
    if (fs.existsSync(obsidianConfigPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(obsidianConfigPath, 'utf8'));
            if (config.path && fs.existsSync(config.path)) {
                vaultDir = path.dirname(config.path);
            }
        } catch(e) {}
    }
    
    if (!vaultDir) return { nodes: [], links: [] };

    const files = walkSync(vaultDir);
    const nodes = [];
    const links = [];
    const nodeIds = new Set();
    const addNode = (id, group, val=1) => {
        if (!nodeIds.has(id)) {
            nodeIds.add(id);
            nodes.push({ id, name: id, group, val });
        }
    };

    files.forEach(filepath => {
        const basename = path.basename(filepath, '.md');
        addNode(basename, 1, 5);
        
        try {
            const content = fs.readFileSync(filepath, 'utf8');
            const linkRegex = /\[\[(.*?)\]\]/g;
            let match;
            while ((match = linkRegex.exec(content)) !== null) {
                const linkTarget = match[1].split('|')[0].trim();
                if (linkTarget) {
                    addNode(linkTarget, 1, 2);
                    links.push({ source: basename, target: linkTarget, type: 'link' });
                }
            }
            const tagRegex = /(?:^|\s)#([a-zA-Z0-9_-]+)/g;
            while ((match = tagRegex.exec(content)) !== null) {
                const tag = '#' + match[1];
                addNode(tag, 2, 2);
                links.push({ source: basename, target: tag, type: 'tag' });
            }
        } catch(e) {}
    });

    return { nodes, links };
});

import bambu from './bambu.js';
import si from 'systeminformation';

ipcMain.on('set-bambu-config', (event, { ip, serial, accessCode }) => {
    bambu.connect(ip, serial, accessCode, (status) => {
        // We could broadcast status changes to the frontend if we want real-time updates without polling
        // if (mainWindow) mainWindow.webContents.send('bambu-status-update', status);
    });
});

ipcMain.handle('get-bambu-status', () => {
    return bambu.getStatus();
});

ipcMain.handle('send-bambu-command', (event, command) => {
    return bambu.sendCommand(command);
});

ipcMain.handle('get-system-stats', async () => {
    try {
        const [cpu, mem, cpuTemp, fsSize, graphics] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.cpuTemperature(),
            si.fsSize(),
            si.graphics()
        ]);
        
        let gpuTemp = null;
        if (graphics.controllers && graphics.controllers.length > 0) {
            // some GPUs report temp in si.graphics(), but not all
            gpuTemp = graphics.controllers[0].temperatureGpu || graphics.controllers[0].temperature; 
        }

        return {
            cpuLoad: cpu.currentLoad,
            memUsed: mem.active,
            memTotal: mem.total,
            cpuTemp: cpuTemp.main,
            gpuTemp: gpuTemp,
            fs: fsSize.map(d => ({
                fs: d.fs,
                size: d.size,
                used: d.used,
                use: d.use,
                mount: d.mount
            }))
        };
    } catch (e) {
        console.error("Failed to get system stats:", e);
        return null;
    }
});

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.whenReady().then(() => {
    createWindow();
    startWebhookServer();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    if (webhookServer) {
        webhookServer.close();
    }
});
