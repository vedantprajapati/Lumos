import React, { useState, useEffect, useRef } from 'react';
import * as Vosk from 'vosk-browser';
import Widget from './Widget';
import Companion from './Companion';
import KnowledgeGraph from './KnowledgeGraph';
import CronWidget from './CronWidget';
import BambuWidget from './BambuWidget';
import SystemStatsWidget from './SystemStatsWidget';
import { useGoogleCalendar } from './useGoogleCalendar';
import './index.css';

import ClockWidget from './ClockWidget';
import './index.css';

// --- App Component ---
function App() {
    // Zoom/Edit/View states
    const [editModeWidgetId, setEditModeWidgetId] = useState(null);
    const [currentViewIndex, setCurrentViewIndex] = useState(0);
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const activeStreamRef = useRef(null);
    const isPlayingRef = useRef(false);

    // Notes and Obsidian state
    const [notesText, setNotesText] = useState("");
    const [obsidianPath, setObsidianPath] = useState("");
    const [showObsidianConfig, setShowObsidianConfig] = useState(false);
    
    // Track if this is the first load to avoid overwriting Obsidian with empty string
    const [notesLoaded, setNotesLoaded] = useState(false);

    useEffect(() => {
        const loadNotes = async () => {
            const path = await window.electronAPI.getObsidianPath();
            if (path) {
                setObsidianPath(path);
                const text = await window.electronAPI.readObsidianNote();
                if (text !== null) {
                    setNotesText(text);
                }
            } else {
                // Fallback to localStorage migration
                const savedText = localStorage.getItem('projector_notes_text');
                if (savedText !== null) {
                    setNotesText(savedText);
                } else {
                    const entriesJson = localStorage.getItem('projector_notes_entries');
                    if (entriesJson) {
                        try {
                            const entries = JSON.parse(entriesJson);
                            setNotesText(entries.map(n => `• ${n.text}`).join('\n'));
                        } catch (e) {}
                    }
                }
            }
            setNotesLoaded(true);
        };
        loadNotes();

        // Listen for external Obsidian changes
        window.electronAPI.onObsidianNoteChanged((text) => {
            setNotesText(text);
        });
    }, []);

    // Save notes on change
    useEffect(() => {
        if (!notesLoaded) return;
        if (obsidianPath) {
            window.electronAPI.writeObsidianNote(notesText);
        } else {
            localStorage.setItem('projector_notes_text', notesText);
        }
    }, [notesText, obsidianPath, notesLoaded]);

    // Gemini API Key & Audio Recording States
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [speechTranscript, setSpeechTranscript] = useState('');
    const isAltRightActiveRef = useRef(false);
    const [isAltRightActive, setIsAltRightActive] = useState(false);

    // Vosk Engine Refs
    const voskModelRef = useRef(null);
    const voskRecognizerRef = useRef(null);
    const voskNodeRef = useRef(null);
    const speechTranscriptRef = useRef('');
    const voiceTimeoutRef = useRef(null);

    useEffect(() => {
        speechTranscriptRef.current = speechTranscript;
    }, [speechTranscript]);

    // Global Settings drawer states
    const [showSettings, setShowSettings] = useState(false);
    const [audioInputs, setAudioInputs] = useState([]);
    const [audioOutputs, setAudioOutputs] = useState([]);
    const [selectedInput, setSelectedInput] = useState(() => localStorage.getItem('projector_mic_id') || 'default');
    const [selectedOutput, setSelectedOutput] = useState(() => localStorage.getItem('projector_speaker_id') || 'default');
    const [micVolume, setMicVolume] = useState(0);
    const [userAddress, setUserAddress] = useState(() => localStorage.getItem('projector_user_address') || '');

    const micStreamRef = useRef(null);
    const micAnalyserRef = useRef(null);
    const micIntervalRef = useRef(null);

    // Auto-save the user's Gemini API key and Telegram token if not set
    useEffect(() => {
        if (!localStorage.getItem('projector_gemini_api_key')) {
            localStorage.setItem('projector_gemini_api_key', '');
        }
        if (!localStorage.getItem('projector_telegram_token')) {
            localStorage.setItem('projector_telegram_token', '');
        }
        if (!localStorage.getItem('projector_user_address')) {
            localStorage.setItem('projector_user_address', 'Ontario, Canada');
            setUserAddress('Ontario, Canada');
        }
    }, []);

    // State for Audio
    const [track, setTrack] = useState(() => localStorage.getItem('projector_track') || 'Weight of the World');
    const [artist, setArtist] = useState(() => localStorage.getItem('projector_artist') || 'Keiichi Okabe');
    const [audioConnected, setAudioConnected] = useState(false);
    const [showControls, setShowControls] = useState(false); // Controls if adjustment buttons are visible

    // Audio Refs
    const visualizerBars = [useRef(null), useRef(null), useRef(null), useRef(null), useRef(null)];
    const audioCtxRef = useRef(null);
    const analyserRef = useRef(null);
    const sourceNodeRef = useRef(null);
    const animFrameRef = useRef(null);

    // Themes
    const themes = ['theme-nier', 'theme-amber', 'theme-green', 'theme-red', 'theme-blue', 'theme-steampunk'];
    const [themeIndex, setThemeIndex] = useState(() => {
        const saved = localStorage.getItem('projector_theme');
        const idx = themes.indexOf(saved);
        return idx !== -1 ? idx : 0;
    });

    // Update body theme class
    useEffect(() => {
        themes.forEach(t => document.body.classList.remove(t));
        document.body.classList.add(themes[themeIndex]);
        localStorage.setItem('projector_theme', themes[themeIndex]);
    }, [themeIndex]);

    // Google Calendar States
    const [clientId, setClientId] = useState(() => localStorage.getItem('projector_google_client_id') || '352050046977-a2dm9v7v2qsh49stkbluf9vnrclbgqdv.apps.googleusercontent.com');
    const [clientSecret, setClientSecret] = useState(() => localStorage.getItem('projector_google_client_secret') || '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');
    const [showCalConfig, setShowCalConfig] = useState(false);
    const { calendarEvents, calendarStatus, handleLinkGoogle, handleUnlinkGoogle } = useGoogleCalendar(clientId, clientSecret);
    const [viewToast, setViewToast] = useState(null);

    const [showGeminiConfig, setShowGeminiConfig] = useState(false);
    const [showGraph, setShowGraph] = useState(false);
    const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem('projector_gemini_api_key') || '');

    const [showTelegramConfig, setShowTelegramConfig] = useState(false);
    const [telegramToken, setTelegramToken] = useState(() => localStorage.getItem('projector_telegram_token') || '');

    const [bambuConfig, setBambuConfig] = useState(() => {
        return {
            ip: localStorage.getItem('projector_bambu_ip') || '',
            serial: localStorage.getItem('projector_bambu_serial') || '',
            accessCode: localStorage.getItem('projector_bambu_access') || ''
        };
    });
    const [showBambuConfig, setShowBambuConfig] = useState(false);
    
    // Send Bambu config to backend on load
    useEffect(() => {
        if (window.electronAPI && bambuConfig.ip && bambuConfig.serial && bambuConfig.accessCode) {
            window.electronAPI.setBambuConfig(bambuConfig);
        }
    }, [bambuConfig]);

    const handleSaveGeminiKey = (val) => {
        setGeminiApiKey(val);
        localStorage.setItem('projector_gemini_api_key', val);
    };

    const handleSaveTelegramToken = (val) => {
        setTelegramToken(val);
        localStorage.setItem('projector_telegram_token', val);
        if (window.electronAPI) {
            window.electronAPI.updateTelegramToken(val);
        }
    };

    // Calendar API logic extracted to useGoogleCalendar

    // Initialize Vosk offline model
    useEffect(() => {
        const initVosk = async () => {
            try {
                console.log("Loading offline Vosk acoustic model...");
                const model = await Vosk.createModel('/model.zip');
                voskModelRef.current = model;
                console.log("Vosk model loaded successfully.");
                setIsModelLoaded(true);
            } catch (err) {
                console.error("Vosk model load failed:", err);
            }
        };
        initVosk();
    }, []);

    // Re-attach Vosk recognizer node once the model has finished loading
    useEffect(() => {
        if (isModelLoaded && activeStreamRef.current) {
            console.log("Vosk model loaded. Initializing/attaching speech recognizer to active stream.");
            setupAudioStream(activeStreamRef.current);
        }
    }, [isModelLoaded]);

    // Mount hooks

    // Listen for auth success, external note triggers, Telegram commands, and sync token
    useEffect(() => {
        if (window.electronAPI) {
            window.electronAPI.onExecuteIntent((intent) => {
                console.log("Received Webhook Intent:", intent);
                const responseMsg = executeVoiceIntent(intent);
                if (responseMsg) speakText(responseMsg);
            });
            window.electronAPI.onCalendarAuthSuccess(() => {
                setShowCalConfig(false);
            });

            window.electronAPI.onExternalNoteAdded((text) => {
                setNotesText(prev => prev ? `${prev}\n• ${text}` : `• ${text}`);
            });

            window.electronAPI.onExternalCommandReceived(({ text, chatId }) => {
                console.log("External Telegram command received:", text);
                processTextCommand(text, chatId);
            });

            window.electronAPI.onExternalMediaReceived(({ base64Data, mimeType, chatId }) => {
                console.log(`External Telegram media received. Mime: ${mimeType}`);
                processExternalMediaCommand(base64Data, mimeType, chatId);
            });

            const savedToken = localStorage.getItem('projector_telegram_token');
            if (savedToken) {
                window.electronAPI.updateTelegramToken(savedToken);
            }
        }
    }, []);

    const loadAudioDevices = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const inputs = devices.filter(d => d.kind === 'audioinput');
            const outputs = devices.filter(d => d.kind === 'audiooutput');
            setAudioInputs(inputs);
            setAudioOutputs(outputs);
        } catch (err) {
            console.error("Failed to enumerate audio devices:", err);
        }
    };

    const stopMicMeter = () => {
        if (micIntervalRef.current) clearInterval(micIntervalRef.current);
        if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach(track => track.stop());
        }
        micStreamRef.current = null;
        micAnalyserRef.current = null;
        setMicVolume(0);
    };

    const startMicMeter = async (micId) => {
        stopMicMeter();

        // If we have an active visualizer analyser, read from it directly!
        if (analyserRef.current) {
            const analyser = analyserRef.current;
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            micIntervalRef.current = setInterval(() => {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i];
                }
                const average = sum / dataArray.length;
                setMicVolume(Math.round((average / 255) * 100));
            }, 100);
            return;
        }

        try {
            const constraints = micId && micId !== 'default' 
                ? { audio: { deviceId: { exact: micId } } } 
                : { audio: true };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            micStreamRef.current = stream;

            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            micAnalyserRef.current = analyser;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            micIntervalRef.current = setInterval(() => {
                if (micAnalyserRef.current) {
                    micAnalyserRef.current.getByteFrequencyData(dataArray);
                    let sum = 0;
                    for (let i = 0; i < dataArray.length; i++) {
                        sum += dataArray[i];
                    }
                    const average = sum / dataArray.length;
                    setMicVolume(Math.round((average / 255) * 100));
                }
            }, 100);
        } catch (err) {
            console.error("Failed to start mic meter:", err);
        }
    };

    useEffect(() => {
        if (showSettings) {
            loadAudioDevices();
            startMicMeter(selectedInput);
        } else {
            stopMicMeter();
        }
        return () => stopMicMeter();
    }, [showSettings, selectedInput]);

    const handleInputDeviceChange = (e) => {
        const devId = e.target.value;
        setSelectedInput(devId);
        localStorage.setItem('projector_mic_id', devId);
        stopAudio();
        setTimeout(startAudio, 100);
    };

    const handleOutputDeviceChange = (e) => {
        const devId = e.target.value;
        setSelectedOutput(devId);
        localStorage.setItem('projector_speaker_id', devId);
    };

    // Link handlers extracted to useGoogleCalendar

    // Notes update handled directly via handleNotesInput ref listener

    // Save metadata manually if edited
    const handleTrackChange = (e) => {
        setTrack(e.target.value);
        localStorage.setItem('projector_track', e.target.value);
    };

    const handleArtistChange = (e) => {
        setArtist(e.target.value);
        localStorage.setItem('projector_artist', e.target.value);
    };

    // IPC listener for Windows Media updates from Electron Main
    useEffect(() => {
        if (window.electronAPI) {
            window.electronAPI.onNowPlayingUpdate((data) => {
                if (data.title || data.artist) {
                    setTrack(data.title || '');
                    setArtist(data.artist || '');
                    localStorage.setItem('projector_track', data.title || '');
                    localStorage.setItem('projector_artist', data.artist || '');
                }
                setAudioConnected(data.isPlaying === true);
                isPlayingRef.current = data.isPlaying === true;
            });
        }
    }, []);

    // Listen for F11 keypress (fullscreen) and PageUp/PageDown (views/themes)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'F11') {
                e.preventDefault();
                if (window.electronAPI) {
                    window.electronAPI.toggleFullscreen();
                }
            } else if (e.key === 'PageUp') {
                e.preventDefault();
                if (e.shiftKey) {
                    setThemeIndex(prev => (prev - 1 + themes.length) % themes.length);
                } else {
                    setCurrentViewIndex(prev => (prev - 1 + 3) % 3);
                }
            } else if (e.key === 'PageDown') {
                e.preventDefault();
                if (e.shiftKey) {
                    setThemeIndex(prev => (prev + 1) % themes.length);
                } else {
                    setCurrentViewIndex(prev => (prev + 1) % 3);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [themeIndex]);

    useEffect(() => {
        // Trigger toast on view change
        const viewNames = ["PAGE 1 - GENERAL DASHBOARD", "PAGE 2 - JOBS & TASKS", "PAGE 3 - MONITORING"];
        setViewToast(viewNames[currentViewIndex]);
        const t = setTimeout(() => setViewToast(null), 1200);
        return () => clearTimeout(t);
    }, [currentViewIndex]);

    // Full Screen Toggle via clicking background (fallback for non-drag areas)
    const handleBackgroundClick = async (e) => {
        if (audioCtxRef.current?.state === 'suspended') {
            audioCtxRef.current.resume();
        }
        if (e.target.closest('.widget') || e.target.closest('button') || e.target.closest('.settings-drawer-card')) return;
        if (window.electronAPI) {
            try {
                const isFS = await window.electronAPI.isFullscreen();
                // Only allow ENTERING fullscreen via background click, never exiting!
                if (!isFS) {
                    window.electronAPI.toggleFullscreen();
                }
            } catch (err) {
                console.error("Fullscreen status query failed:", err);
                window.electronAPI.toggleFullscreen();
            }
        }
    };

    const startAudio = () => {
        const savedMicId = localStorage.getItem('projector_mic_id');
        const constraints = savedMicId && savedMicId !== 'default'
            ? { audio: { deviceId: { exact: savedMicId } } }
            : { audio: true };

        navigator.mediaDevices.getUserMedia(constraints)
            .then(stream => {
                activeStreamRef.current = stream;
                setupAudioStream(stream);
            })
            .catch(err => {
                console.warn("Microphone access failed. Prompting system audio share screen...", err);
                navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
                    .then(stream => {
                        activeStreamRef.current = stream;
                        setupAudioStream(stream);
                    })
                    .catch(err2 => {
                        alert("Could not connect audio. Enable microphone permissions.");
                        console.error(err2);
                    });
            });
    };

    const setupAudioStream = (stream) => {
        // Cleanup old stream, nodes and recognizer to prevent resource leakage on re-runs
        if (voskNodeRef.current) {
            try { voskNodeRef.current.disconnect(); } catch (e) {}
            voskNodeRef.current = null;
        }
        if (voskRecognizerRef.current) {
            try { voskRecognizerRef.current.remove(); } catch (e) {}
            voskRecognizerRef.current = null;
        }
        if (audioCtxRef.current) {
            try { audioCtxRef.current.close(); } catch (e) {}
            audioCtxRef.current = null;
        }

        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        
        // Safeguard: Ensure the audio context is active
        if (audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume();
        }

        analyserRef.current = audioCtxRef.current.createAnalyser();
        analyserRef.current.fftSize = 32;

        sourceNodeRef.current = audioCtxRef.current.createMediaStreamSource(stream);
        sourceNodeRef.current.connect(analyserRef.current);

        if (voskModelRef.current) {
            try {
                // Initialize a single full-vocabulary recognizer to handle both wake words and live transcription
                const rec = new voskModelRef.current.KaldiRecognizer(audioCtxRef.current.sampleRate);
                rec.on("result", (msg) => {
                    const text = (msg.result.text || '').trim().toLowerCase();
                    if (!text) return;

                    if (isAltRightActiveRef.current) {
                        const cleanText = text.replace(/^(lumos|lew\s+moss|lew\s+mos|lew\s+mohs|loo\s+mos|love\s+mos|love\s+moss|blue\s+moss|loomis|luminous|nox|knocks|nocks|knox|dabbu|double|taboo|dabu)\s*/i, '');
                        if (cleanText) setSpeechTranscript('"' + cleanText + '"');
                    } else {
                        if (text.includes("lumos") || text.includes("lew moss") || text.includes("lew mos") || text.includes("lew mohs") || text.includes("loo mos") || text.includes("love mos") || text.includes("love moss") || text.includes("blue moss") || text.includes("loomis") || text.includes("luminous")) {
                            handleWakeWordTrigger("lumos");
                        } else if (text.includes("nox") || text.includes("knocks") || text.includes("nocks") || text.includes("knox")) {
                            handleWakeWordTrigger("nox");
                        } else if (text.includes("dabbu") || text.includes("double") || text.includes("taboo") || text.includes("dabu")) {
                            handleWakeWordTrigger("dabbu");
                        }
                    }
                });
                rec.on("partialresult", (msg) => {
                    const partial = (msg.result.partial || '').trim().toLowerCase();
                    if (!partial) return;
                    console.log("[VOSK-PARTIAL]", partial);

                    if (isAltRightActiveRef.current) {
                        const cleanText = partial.replace(/^(lumos|lew\s+moss|lew\s+mos|lew\s+mohs|loo\s+mos|love\s+mos|love\s+moss|blue\s+moss|loomis|luminous|nox|knocks|nocks|knox|dabbu|double|taboo|dabu)\s*/i, '');
                        if (cleanText) {
                            setSpeechTranscript('"' + cleanText + '..."');
                        }
                    } else {
                        if (partial.includes("lew moss") || partial.includes("lumos") || partial.includes("lew mos") || partial.includes("lew mohs") || partial.includes("loo mos") || partial.includes("love mos") || partial.includes("love moss") || partial.includes("blue moss") || partial.includes("loomis") || partial.includes("luminous")) {
                            console.log("Local offline trigger on partial homophone: LUMOS");
                            handleWakeWordTrigger("lumos");
                        } else if (partial.includes("nox") || partial.includes("knocks") || partial.includes("nocks") || partial.includes("knox")) {
                            console.log("Local offline trigger on partial homophone: NOX");
                            handleWakeWordTrigger("nox");
                        } else if (partial.includes("dabbu") || partial.includes("double") || partial.includes("taboo") || partial.includes("dabu")) {
                            console.log("Local offline trigger on partial homophone: DABBU");
                            handleWakeWordTrigger("dabbu");
                        }
                    }
                });
                voskRecognizerRef.current = rec;

                const recognizerNode = audioCtxRef.current.createScriptProcessor(4096, 1, 1);
                recognizerNode.onaudioprocess = (event) => {
                    if (voskRecognizerRef.current) {
                        try { 
                            voskRecognizerRef.current.acceptWaveform(event.inputBuffer); 
                        } catch (e) {
                            try {
                                voskRecognizerRef.current.acceptWaveform(event.inputBuffer.getChannelData(0));
                            } catch(e2) {}
                        }
                    }
                };
                
                sourceNodeRef.current.connect(recognizerNode);
                
                // Connect to a dummy zero-gain node to keep the processor running continuously
                const zeroGain = audioCtxRef.current.createGain();
                zeroGain.gain.value = 0;
                recognizerNode.connect(zeroGain);
                zeroGain.connect(audioCtxRef.current.destination);
                
                voskNodeRef.current = recognizerNode;
            } catch (err) {
                console.error("Failed to attach Vosk recognizer:", err);
            }
        }

        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            animFrameRef.current = requestAnimationFrame(draw);
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);

            visualizerBars.forEach((barRef, i) => {
                if (barRef.current) {
                    let val = dataArray[i + 1] || 0;
                    
                    if (!isPlayingRef.current) {
                        // Force completely flat bar if no music is playing
                        val = 0;
                    } else {
                        // Noise floor: ignore ambient room hum so waves sit flat when quiet
                        const noiseFloor = 35;
                        val = Math.max(0, val - noiseFloor);
                    }
                    
                    const percent = 15 + (val / (255 - 35)) * 85;
                    barRef.current.style.height = `${percent}%`;
                }
            });
        };

        draw();
    };

    // Automatically trigger audio capture on mount
    useEffect(() => {
        startAudio();
        return () => {
            stopAudio();
        };
    }, []);

    const stopAudio = () => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
        if (audioCtxRef.current) audioCtxRef.current.close();

        audioCtxRef.current = null;
        analyserRef.current = null;
        sourceNodeRef.current = null;

        visualizerBars.forEach(barRef => {
            if (barRef.current) barRef.current.style.height = '15%';
        });
        setAudioConnected(false);
    };

    useEffect(() => {
        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
            if (audioCtxRef.current) audioCtxRef.current.close();
        };
    }, []);

    const blobToBase64 = (blob) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64data = reader.result.split(',')[1];
                resolve(base64data);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    const addGoogleCalendarEvent = async (summary, startDateTime, endDateTime) => {
        if (!window.electronAPI) return;
        try {
            const tokens = await window.electronAPI.getCalendarTokens();
            if (!tokens || !tokens.accessToken) {
                console.warn("Calendar not linked.");
                return;
            }
            
            let end = endDateTime;
            if (!end) {
                const start = new Date(startDateTime);
                start.setHours(start.getHours() + 1);
                end = start.toISOString();
            }
            
            const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${tokens.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    summary: summary,
                    start: { dateTime: startDateTime },
                    end: { dateTime: end }
                })
            });
            
            if (response.ok) {
                console.log("Calendar event added successfully!");
                fetchCalendarEvents();
            } else {
                console.error("Failed to add calendar event:", await response.text());
            }
        } catch (err) {
            console.error("Error adding calendar event:", err);
        }
    };

    const speakText = async (text) => {
        if (!text) return;
        const synth = window.speechSynthesis;
        let voices = synth.getVoices();
        
        // Voices may not be loaded yet on first call — try a synchronous fallback
        if (voices.length === 0) {
            // Force a short wait and retry
            await new Promise(r => setTimeout(r, 100));
            voices = synth.getVoices();
        }
        
        // Try to find a UK British voice (Google UK English Male/Female or standard en-GB)
        const ukVoice = voices.find(v => v.lang === 'en-GB' || v.name.includes('UK English') || v.name.includes('Great Britain')) || voices[0];
        
        const utterance = new SpeechSynthesisUtterance(text);
        if (ukVoice) {
            utterance.voice = ukVoice;
            utterance.lang = 'en-GB'; // explicitly force language so OS fallback sounds british
        }
        utterance.rate = 1.15; // standard conversational speed
        utterance.pitch = 0.95; // slightly lower for a sophisticated sound
        
        synth.cancel(); // stop any current speaking
        synth.speak(utterance);
    };

    const executeVoiceIntent = (intent) => {
        const { action, data } = intent;
        console.log("Executing voice intent:", action, data);
        
        if (action === 'APPEND_NOTE') {
            if (data.text) {
                setNotesText(prev => prev ? `${prev}\n• ${data.text}` : `• ${data.text}`);
                console.log("Appended note:", data.text);
                return `Note appended: "${data.text}"`;
            }
            return "No text provided to append.";
        } else if (action === 'REMOVE_NOTE') {
            if (data.keyword) {
                setNotesText(prev => {
                    const lines = prev.split('\n');
                    const filtered = lines.filter(line => !line.toLowerCase().includes(data.keyword.toLowerCase()));
                    console.log("Removed note line matching keyword:", data.keyword);
                    return filtered.join('\n');
                });
                return `Removed notes matching keyword: "${data.keyword}"`;
            }
            return "No keyword provided to remove note.";
        } else if (action === 'CLEAR_NOTES') {
            setNotesText("");
            return "Notepad cleared.";
        } else if (action === 'CONVERSATIONAL_RESPONSE') {
            if (data.reply) {
                setSpeechTranscript(`Lumos: ${data.reply}`);
                setTimeout(() => {
                    setSpeechTranscript(prev => prev.startsWith('Lumos:') ? '' : prev);
                }, 7000);
                return data.reply;
            }
            return "I'm ready!";
        } else if (action === 'CHANGE_THEME') {
            if (data.theme) {
                const themesList = ['theme-nier', 'theme-amber', 'theme-green', 'theme-red', 'theme-blue', 'theme-steampunk'];
                const index = themesList.indexOf(`theme-${data.theme}`);
                if (index !== -1) {
                    setThemeIndex(index);
                    return `Theme changed to ${data.theme}.`;
                }
            }
            return "Invalid theme specified.";
        } else if (action === 'MEDIA_CONTROL') {
            if (data.command && window.electronAPI) {
                window.electronAPI.mediaControl(data.command);
                return `Media control executed: ${data.command}`;
            }
            return "No media control command specified.";
        } else if (action === 'ADD_CALENDAR_EVENT') {
            if (data.summary && data.startDateTime) {
                addGoogleCalendarEvent(data.summary, data.startDateTime, data.endDateTime);
                return `Added calendar event: "${data.summary}" starting ${data.startDateTime}`;
            }
            return "Invalid calendar event parameters.";
        } else if (action === 'SET_TIMER') {
            if (data.seconds) {
                const label = data.label || 'Timer';
                const mins = Math.floor(data.seconds / 60);
                const secs = data.seconds % 60;
                const timeStr = mins > 0 ? `${mins} minute${mins > 1 ? 's' : ''}${secs > 0 ? ` ${secs} seconds` : ''}` : `${secs} seconds`;
                setTimeout(() => {
                    speakText(`${label} is done!`);
                    setSpeechTranscript(`⏰ ${label} finished!`);
                }, data.seconds * 1000);
                return `${label} set for ${timeStr}.`;
            }
            return "No timer duration specified.";
        } else if (action === 'STOPWATCH') {
            if (data.command === 'start' || data.command === 'toggle') {
                setSwActive(prev => !prev);
                return "Stopwatch toggled.";
            } else if (data.command === 'stop') {
                setSwActive(false);
                return "Stopwatch stopped.";
            } else if (data.command === 'reset') {
                setSwActive(false);
                setSwTime(0);
                return "Stopwatch reset.";
            }
            return "Unknown stopwatch command.";
        } else if (action === 'OPEN_URL') {
            if (data.url && window.electronAPI) {
                window.electronAPI.openExternal(data.url);
                return `Opening ${data.url}`;
            }
            return "No URL specified.";
        } else if (action === 'FULLSCREEN') {
            if (window.electronAPI) {
                window.electronAPI.toggleFullscreen();
            }
            return "Toggled fullscreen.";
        } else if (action === 'TELL_JOKE') {
            if (data.joke) {
                setSpeechTranscript(`Lumos: ${data.joke}`);
                setTimeout(() => setSpeechTranscript(''), 8000);
                return data.joke;
            }
            return "I couldn't think of a joke right now.";
        } else if (action === 'READ_NOTES') {
            if (notesText && notesText.trim()) {
                return `Here are your notes: ${notesText}`;
            }
            return "Your notepad is empty.";
        } else if (action === 'BAMBU_CONTROL') {
            if (data.command && window.electronAPI) {
                window.electronAPI.sendBambuCommand(data.command);
                return `Sent ${data.command} command to 3D printer.`;
            }
            return "No printer command specified.";
        }
        return "I processed your request, but didn't match an action.";
    };

    const processTextCommand = async (textQuery, externalChatId = null) => {
        const apiKey = localStorage.getItem('projector_gemini_api_key');
        if (!apiKey) return;
        
        setIsProcessing(true);
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
            const currentTime = new Date().toString();
            
            const notesContext = notesText ? notesText : "[Notepad is empty]";
            const calendarContext = calendarEvents.length > 0 
                ? calendarEvents.map(e => `- ${e.summary || '[No Title]'} (From: ${e.start?.dateTime || e.start?.date || ''} To: ${e.end?.dateTime || e.end?.date || ''})`).join('\n')
                : "[No calendar events scheduled]";

            const [bambuStatus, sysStats] = window.electronAPI ? await Promise.all([
                window.electronAPI.getBambuStatus(),
                window.electronAPI.getSystemStats()
            ]) : [null, null];

            const bambuContext = bambuStatus && bambuStatus.connected
                ? `Printer State: ${bambuStatus.gcode_state}, Progress: ${bambuStatus.mc_percent}%, Nozzle: ${bambuStatus.nozzle_temp}°C, Bed: ${bambuStatus.bed_temp}°C`
                : "[Printer Offline/Disconnected]";

            const sysContext = sysStats 
                ? `CPU Load: ${Math.round(sysStats.cpuLoad)}%, Mem Used: ${Math.round((sysStats.memUsed || 0)/1024/1024/1024)}GB, CPU Temp: ${sysStats.cpuTemp}°C`
                : "[System Stats Unavailable]";

            const systemInstruction = 
                "You are Lumos, the projection wall smart assistant. " +
                "Your job is to parse the user's spoken or text command and choose the correct action to execute. " +
                "Return ONLY a raw JSON block with the action and data, nothing else. " +
                "The supported actions are:\n" +
                "1. APPEND_NOTE: Appends text to the note editor. Extract the text under 'text' parameter.\n" +
                "2. CLEAR_NOTES: Wipes the notepad empty.\n" +
                "3. REMOVE_NOTE: Removes a specific note entry. Extract the keyword under 'keyword' parameter.\n" +
                "4. CHANGE_THEME: Changes the visual color theme. Under 'theme' parameter, return one of: 'nier', 'amber', 'green', 'red', 'blue', 'steampunk'.\n" +
                "5. MEDIA_CONTROL: Controls the PC music playback. Under 'command' parameter, return one of: 'play-pause', 'next', 'prev', 'volume-up', 'volume-down'.\n" +
                "6. ADD_CALENDAR_EVENT: Adds a Google Calendar event. Extract 'summary', 'startDateTime' (ISO 8601), and 'endDateTime' (ISO 8601, default +1hr). Current time: " + currentTime + ".\n" +
                "7. SET_TIMER: Sets a countdown timer. Extract the number of seconds under 'seconds' parameter and an optional 'label' parameter.\n" +
                "8. STOPWATCH: Controls the stopwatch. Under 'command' parameter, return one of: 'start', 'stop', 'reset', 'toggle'.\n" +
                "9. OPEN_URL: Opens a website in the user's default browser. Extract the URL under 'url' parameter.\n" +
                "10. FULLSCREEN: Toggles fullscreen mode. No parameters needed.\n" +
                "11. TELL_JOKE: User wants to hear a joke. Generate a short, witty joke under 'joke' parameter.\n" +
                "12. READ_NOTES: User wants their notes read back to them. No parameters needed.\n" +
                "13. CONVERSATIONAL_RESPONSE: If the user is asking a general question, greeting you, requesting information (weather, news, trivia, math, etc.), chatting, or asking about their calendar or notes. Under the 'reply' parameter, write a very brief, friendly response. USE GOOGLE SEARCH for real-time questions.\n" +
                "14. BAMBU_CONTROL: Controls the Bambu Lab 3D Printer. Under 'command' parameter, return one of: 'pause', 'resume', 'stop'.\n" +
                "15. HELP: If the command is completely unclear.\n\n" +
                "CONTEXT INFORMATION:\n" +
                "- Current local time: " + currentTime + "\n" +
                (userAddress ? "- User's home address: " + userAddress + "\n" : "") +
                "- User's Notepad:\n" + notesContext + "\n" +
                "- User's Calendar Events:\n" + calendarContext + "\n" +
                "- 3D Printer Status:\n  " + bambuContext + "\n" +
                "- PC Stats:\n  " + sysContext + "\n\n" +
                "Example JSON outputs:\n" +
                "{\"action\": \"APPEND_NOTE\", \"data\": {\"text\": \"buy groceries tomorrow\"}}\n" +
                "{\"action\": \"CONVERSATIONAL_RESPONSE\", \"data\": {\"reply\": \"It's currently 22°C and sunny in East Gwillimbury.\"}}\n" +
                "{\"action\": \"SET_TIMER\", \"data\": {\"seconds\": 300, \"label\": \"Tea timer\"}}\n" +
                "{\"action\": \"ADD_CALENDAR_EVENT\", \"data\": {\"summary\": \"Dentist appointment\", \"startDateTime\": \"2026-07-10T15:00:00\", \"endDateTime\": \"2026-07-10T16:00:00\"}}";

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                { text: textQuery }
                            ]
                        }
                    ],
                    systemInstruction: {
                        parts: [
                            { text: systemInstruction }
                        ]
                    },
                    generationConfig: {
                        responseMimeType: "application/json"
                    },
                    tools: [{ googleSearch: {} }]
                })
            });
            
            const result = await response.json();
            const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (rawText) {
                const intent = JSON.parse(rawText.trim());
                const reply = executeVoiceIntent(intent);
                if (externalChatId && window.electronAPI) {
                    window.electronAPI.sendTelegramReply(externalChatId, reply);
                }
            }
        } catch (e) {
            console.error("Gemini text command processing failed:", e);
            if (externalChatId && window.electronAPI) {
                window.electronAPI.sendTelegramReply(externalChatId, "Sorry, I had trouble processing that request.");
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const processExternalMediaCommand = async (base64Data, mimeType, externalChatId) => {
        const apiKey = localStorage.getItem('projector_gemini_api_key');
        if (!apiKey) return;
        
        setIsProcessing(true);
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
            const currentTime = new Date().toString();
            
            const notesContext = notesText ? notesText : "[Notepad is empty]";
            const calendarContext = calendarEvents.length > 0 
                ? calendarEvents.map(e => `- ${e.summary || '[No Title]'} (From: ${e.start?.dateTime || e.start?.date || ''} To: ${e.end?.dateTime || e.end?.date || ''})`).join('\n')
                : "[No calendar events scheduled]";

            const systemInstruction = 
                "You are Lumos, the projection wall smart assistant. " +
                "Your job is to parse the user's spoken or video command and choose the correct action to execute. " +
                "Return ONLY a raw JSON block with the action and data, nothing else. " +
                "The supported actions are:\n" +
                "1. APPEND_NOTE: Appends text to the note editor. Extract the text they wanted to write under 'text' parameter.\n" +
                "2. CLEAR_NOTES: Wipes the notepad empty.\n" +
                "3. REMOVE_NOTE: Removes a specific note entry. Extract the keyword or text snippet under the parameter 'keyword'.\n" +
                "4. CHANGE_THEME: Changes the visual color theme. Under 'theme' parameter, return one of: 'nier', 'amber', 'green', 'red', 'blue'.\n" +
                "5. MEDIA_CONTROL: Controls the PC music playback. Under 'command' parameter, return one of: 'play-pause', 'next', 'prev', 'volume-up', 'volume-down'.\n" +
                "6. ADD_CALENDAR_EVENT: Adds a new Google Calendar event. Extract the event title under parameter 'summary'. Extract the start date and time as an ISO 8601 string under the parameter 'startDateTime' (the current local time is: " + currentTime + "). Default the end time to 1 hour after startDateTime under parameter 'endDateTime' (ISO 8601 string).\n" +
                "7. CONVERSATIONAL_RESPONSE: If the user is asking a general question, greeting you, requesting information, chatting, or asking about their calendar or notes. Under the 'reply' parameter, write a very brief, friendly response using the context below.\n" +
                "8. HELP: If the command is completely unclear.\n\n" +
                "CONTEXT INFORMATION:\n" +
                "- Current local time: " + currentTime + "\n" +
                "- User's Notepad:\n" + notesContext + "\n" +
                "- User's Calendar Events:\n" + calendarContext + "\n\n" +
                "Example JSON outputs:\n" +
                "{\"action\": \"APPEND_NOTE\", \"data\": {\"text\": \"buy groceries tomorrow\"}}\n" +
                "{\"action\": \"REMOVE_NOTE\", \"data\": {\"keyword\": \"groceries\"}}\n" +
                "{\"action\": \"CONVERSATIONAL_RESPONSE\", \"data\": {\"reply\": \"You have a dentist appointment tomorrow at 3 PM.\"}}\n" +
                "{\"action\": \"CHANGE_THEME\", \"data\": {\"theme\": \"amber\"}}\n" +
                "{\"action\": \"ADD_CALENDAR_EVENT\", \"data\": {\"summary\": \"Dentist appointment\", \"startDateTime\": \"2026-07-10T15:00:00\", \"endDateTime\": \"2026-07-10T16:00:00\"}}";

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    inlineData: {
                                        mimeType: mimeType,
                                        data: base64Data
                                    }
                                },
                                {
                                    text: "Analyze this media command (audio or video message) sent via Telegram. Output the correct JSON action block."
                                }
                            ]
                        }
                    ],
                    systemInstruction: {
                        parts: [
                            { text: systemInstruction }
                        ]
                    },
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                })
            });
            
            const result = await response.json();
            const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (rawText) {
                const intent = JSON.parse(rawText.trim());
                const reply = executeVoiceIntent(intent);
                if (externalChatId && window.electronAPI) {
                    window.electronAPI.sendTelegramReply(externalChatId, reply);
                }
            }
        } catch (e) {
            console.error("Gemini external media command processing failed:", e);
            if (externalChatId && window.electronAPI) {
                window.electronAPI.sendTelegramReply(externalChatId, "Sorry, I had trouble processing the audio/video media.");
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const processAudioCommand = async (audioBlob) => {
        const apiKey = localStorage.getItem('projector_gemini_api_key');
        if (!apiKey) {
            console.warn("Gemini API key is not configured.");
            return;
        }
        
        setIsProcessing(true);
        setSpeechTranscript("Processing audio command...");
        try {
            const base64Audio = await blobToBase64(audioBlob);
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
            const currentTime = new Date().toString();
            
            const notesContext = notesText ? notesText : "[Notepad is empty]";
            const calendarContext = calendarEvents.length > 0 
                ? calendarEvents.map(e => `- ${e.summary || '[No Title]'} (From: ${e.start?.dateTime || e.start?.date || ''} To: ${e.end?.dateTime || e.end?.date || ''})`).join('\n')
                : "[No calendar events scheduled]";

            const [bambuStatus, sysStats] = window.electronAPI ? await Promise.all([
                window.electronAPI.getBambuStatus(),
                window.electronAPI.getSystemStats()
            ]) : [null, null];

            const bambuContext = bambuStatus && bambuStatus.connected
                ? `Printer State: ${bambuStatus.gcode_state}, Progress: ${bambuStatus.mc_percent}%, Nozzle: ${bambuStatus.nozzle_temp}°C, Bed: ${bambuStatus.bed_temp}°C`
                : "[Printer Offline/Disconnected]";

            const sysContext = sysStats 
                ? `CPU Load: ${Math.round(sysStats.cpuLoad)}%, Mem Used: ${Math.round((sysStats.memUsed || 0)/1024/1024/1024)}GB, CPU Temp: ${sysStats.cpuTemp}°C`
                : "[System Stats Unavailable]";

            const systemInstruction = 
                "You are Lumos, the projection wall smart assistant. " +
                "Your job is to parse the user's spoken command and choose the correct action to execute. " +
                "Return ONLY a raw JSON block with the action and data, nothing else. " +
                "The supported actions are:\n" +
                "1. APPEND_NOTE: Appends text to the note editor. Extract the text under 'text' parameter.\n" +
                "2. CLEAR_NOTES: Wipes the notepad empty.\n" +
                "3. REMOVE_NOTE: Removes a specific note entry. Extract the keyword under 'keyword' parameter.\n" +
                "4. CHANGE_THEME: Changes the visual color theme. Under 'theme' parameter, return one of: 'nier', 'amber', 'green', 'red', 'blue', 'steampunk'.\n" +
                "5. MEDIA_CONTROL: Controls the PC music playback. Under 'command' parameter, return one of: 'play-pause', 'next', 'prev', 'volume-up', 'volume-down'.\n" +
                "6. ADD_CALENDAR_EVENT: Adds a Google Calendar event. Extract 'summary', 'startDateTime' (ISO 8601), and 'endDateTime' (ISO 8601, default +1hr). Current time: " + currentTime + ".\n" +
                "7. SET_TIMER: Sets a countdown timer. Extract the number of seconds under 'seconds' parameter and an optional 'label' parameter.\n" +
                "8. STOPWATCH: Controls the stopwatch. Under 'command' parameter, return one of: 'start', 'stop', 'reset', 'toggle'.\n" +
                "9. OPEN_URL: Opens a website in the user's default browser. Extract the URL under 'url' parameter. If the user says 'open YouTube', use 'https://youtube.com', etc.\n" +
                "10. FULLSCREEN: Toggles fullscreen mode. No parameters needed.\n" +
                "11. TELL_JOKE: User wants to hear a joke. Generate a short, witty joke under the 'joke' parameter.\n" +
                "12. READ_NOTES: User wants their notes read back to them. No parameters needed — the system will read the notepad aloud.\n" +
                "13. CONVERSATIONAL_RESPONSE: If the user is asking a general question, greeting you, requesting information (weather, news, trivia, math, etc.), chatting, or asking about their calendar or notes. Under the 'reply' parameter, write a very brief, friendly response. USE GOOGLE SEARCH for real-time questions.\n" +
                "14. BAMBU_CONTROL: Controls the Bambu Lab 3D Printer. Under 'command' parameter, return one of: 'pause', 'resume', 'stop'.\n" +
                "15. HELP: If the command is completely unclear.\n\n" +
                "CONTEXT INFORMATION:\n" +
                "- Current local time: " + currentTime + "\n" +
                (userAddress ? "- User's home address: " + userAddress + "\n" : "") +
                "- User's Notepad:\n" + notesContext + "\n" +
                "- User's Calendar Events:\n" + calendarContext + "\n" +
                "- 3D Printer Status:\n  " + bambuContext + "\n" +
                "- PC Stats:\n  " + sysContext + "\n\n" +
                "IMPORTANT: For questions about weather, news, real-time info, or anything you don't know — use Google Search grounding to look it up and provide an accurate answer under CONVERSATIONAL_RESPONSE.\n\n" +
                "Example JSON outputs:\n" +
                "{\"action\": \"APPEND_NOTE\", \"data\": {\"text\": \"buy groceries tomorrow\"}}\n" +
                "{\"action\": \"REMOVE_NOTE\", \"data\": {\"keyword\": \"groceries\"}}\n" +
                "{\"action\": \"CONVERSATIONAL_RESPONSE\", \"data\": {\"reply\": \"It's currently 22°C and sunny in East Gwillimbury.\"}}\n" +
                "{\"action\": \"SET_TIMER\", \"data\": {\"seconds\": 300, \"label\": \"Tea timer\"}}\n" +
                "{\"action\": \"OPEN_URL\", \"data\": {\"url\": \"https://youtube.com\"}}\n" +
                "{\"action\": \"TELL_JOKE\", \"data\": {\"joke\": \"Why do programmers prefer dark mode? Because light attracts bugs.\"}}\n" +
                "{\"action\": \"ADD_CALENDAR_EVENT\", \"data\": {\"summary\": \"Dentist appointment\", \"startDateTime\": \"2026-07-10T15:00:00\", \"endDateTime\": \"2026-07-10T16:00:00\"}}";

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    inlineData: {
                                        mimeType: 'audio/webm',
                                        data: base64Audio
                                    }
                                },
                                {
                                    text: `Analyze the audio command. The local offline speech-to-text engine transcribed the audio tentatively as: "${speechTranscriptRef.current}". Use this transcription to guide your understanding of the audio content, especially for resolving names, keywords, and specific notepad commands, but rely on the audio if the local transcription is phonetically skewed or incomplete. Output the correct JSON action block.`
                                }
                            ]
                        }
                    ],
                    systemInstruction: {
                        parts: [
                            { text: systemInstruction }
                        ]
                    },
                    generationConfig: {
                        responseMimeType: "application/json"
                    },
                    tools: [{ googleSearch: {} }]
                })
            });
            
            if (!response.ok) {
                const errText = await response.text();
                console.error("Gemini API Error:", response.status, errText);
                setSpeechTranscript(`API Error: ${response.status} - Check settings.`);
                setTimeout(() => { if (!isAltRightActiveRef.current) setSpeechTranscript(''); }, 5000);
                return;
            }

            const result = await response.json();
            const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (rawText) {
                const intent = JSON.parse(rawText.trim());
                const responseMsg = executeVoiceIntent(intent);
                if (responseMsg) speakText(responseMsg);
            } else {
                console.warn("Gemini returned empty text:", result);
                setSpeechTranscript("Error: Invalid response from Gemini.");
                setTimeout(() => { if (!isAltRightActiveRef.current) setSpeechTranscript(''); }, 4000);
            }
        } catch (e) {
            console.error("Gemini audio command processing failed:", e);
            setSpeechTranscript("Network Error: Could not reach Gemini.");
            setTimeout(() => { if (!isAltRightActiveRef.current) setSpeechTranscript(''); }, 5000);
        } finally {
            setIsProcessing(false);
            // DO NOT auto-clear transcript immediately, let the setTimeout handle error messages if they exist
            // Successful commands will be cleared by the executeVoiceIntent or fade out
        }
    };


    const cancelVoiceSession = () => {
        if (voiceTimeoutRef.current) {
            clearTimeout(voiceTimeoutRef.current);
            voiceTimeoutRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        } else {
            isAltRightActiveRef.current = false;
            setIsAltRightActive(false);
            setIsRecording(false);
            setSpeechTranscript('');
            console.log("Voice session cancelled.");
        }
    };

    const triggerAutoCommandRecording = () => {
        if (isRecording || isProcessing) return;
        if (!sourceNodeRef.current) {
            console.warn("No active audio stream to record from.");
            return;
        }

        // Resume AudioContext if suspended (browser security workaround for hotkeys)
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume().catch(e => console.error("AudioContext resume failed:", e));
        }

        isAltRightActiveRef.current = true;
        setIsAltRightActive(true);
        setIsRecording(true);
        setSpeechTranscript("Listening to command...");
        audioChunksRef.current = [];



        // Try getting mediaStream from the source node
        const stream = sourceNodeRef.current.mediaStream;
        let mediaRecorder;
        try {
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        } catch (e) {
            mediaRecorder = new MediaRecorder(stream);
        }
        
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunksRef.current.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            setIsRecording(false);
            isAltRightActiveRef.current = false;
            setIsAltRightActive(false);
            
            if (audioChunksRef.current.length > 0) {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                await processAudioCommand(audioBlob);
            } else {
                setSpeechTranscript('');
            }
        };

        mediaRecorder.start();

        // 5-second max recording time
        voiceTimeoutRef.current = setTimeout(() => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                console.log("Auto-recording timed out. Sending to Gemini...");
                mediaRecorderRef.current.stop();
            }
        }, 5000);
    };

    const startRightAltVoiceSession = () => {
        if (isRecording || isAltRightActiveRef.current) {
            // If already recording, stop early and process!
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                console.log("Right Alt toggled OFF. Sending to Gemini early...");
                mediaRecorderRef.current.stop();
            }
        } else {
            cancelVoiceSession(); // Clean up any hanging session
            triggerAutoCommandRecording();
        }
    };

    // Right Alt (AltGraph) Hotkey press-to-talk and Escape cancel listener
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'AltGraph' || e.code === 'AltRight') {
                e.preventDefault();
                if (e.repeat) return; // Prevent key-repeat from toggling the recording on/off rapidly
                startRightAltVoiceSession();
            } else if (e.key === 'Escape') {
                if (isAltRightActiveRef.current || isRecording) {
                    e.preventDefault();
                    cancelVoiceSession();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    const lastWakeRef = useRef(0);

    const handleWakeWordTrigger = (word) => {
        if (isRecording || isProcessing) return; // Prevent re-triggering while already working
        
        // 2-second cooldown to prevent rapid-fire triggering from Vosk partial buffers
        const now = Date.now();
        if (now - lastWakeRef.current < 2000) return;
        lastWakeRef.current = now;

        console.log(`${word.toUpperCase()} triggered: Initiating local audio recording for Gemini Multimodal API.`);
        triggerAutoCommandRecording();
    };


    return (
        <div className={`app-container ${isRecording ? 'recording-wave' : ''}`} onClick={handleBackgroundClick}>
            {/* Hover Settings Gear Area */}
            <div className="settings-hover-zone">
                <button 
                    className="settings-gear-btn" 
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        setShowSettings(!showSettings);
                        if (audioCtxRef.current?.state === 'suspended') {
                            audioCtxRef.current.resume();
                        }
                    }}
                    title="Audio & System Settings"
                >
                    ⚙
                </button>
            </div>

            {/* Global Settings Drawer Overlay */}
            {showSettings && (
                <div className="settings-drawer-overlay" onClick={() => setShowSettings(false)}>
                    <div className="settings-drawer-card" onClick={(e) => e.stopPropagation()}>
                        <div className="settings-drawer-header">
                            <span className="settings-drawer-title">// SYSTEM SETTINGS</span>
                            <button className="settings-drawer-close" onClick={() => setShowSettings(false)}>[ X ]</button>
                        </div>
                        
                        <div className="settings-drawer-body">
                            {/* Audio Input Selector */}
                            <div className="setting-group">
                                <label className="setting-label">AUDIO INPUT (MICROPHONE):</label>
                                <select 
                                    className="nier-input setting-select"
                                    value={selectedInput}
                                    onChange={handleInputDeviceChange}
                                >
                                    <option value="default">Default System Microphone</option>
                                    {audioInputs.map(device => (
                                        <option key={device.deviceId} value={device.deviceId}>
                                            {device.label || `Microphone (${device.deviceId.slice(0, 5)}...)`}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Mic Level indicator */}
                            <div className="setting-group">
                                <label className="setting-label">MICROPHONE INPUT LEVEL TEST:</label>
                                <div className="mic-level-bar-container">
                                    <div 
                                        className="mic-level-bar-fill" 
                                        style={{ width: `${micVolume}%` }}
                                    />
                                </div>
                                <span className="mic-level-val">{micVolume}%</span>
                            </div>

                            {/* Audio Output Selector */}
                            <div className="setting-group">
                                <label className="setting-label">AUDIO OUTPUT (SPEAKERS):</label>
                                <select 
                                    className="nier-input setting-select"
                                    value={selectedOutput}
                                    onChange={handleOutputDeviceChange}
                                >
                                    <option value="default">Default System Speaker</option>
                                    {audioOutputs.map(device => (
                                        <option key={device.deviceId} value={device.deviceId}>
                                            {device.label || `Speaker (${device.deviceId.slice(0, 5)}...)`}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Unified Gemini API key option */}
                            <div className="setting-group">
                                <label className="setting-label">GEMINI API KEY:</label>
                                <input
                                    type="password"
                                    className="nier-input"
                                    placeholder="Enter Gemini API Key"
                                    value={geminiApiKey}
                                    onChange={(e) => handleSaveGeminiKey(e.target.value)}
                                />
                            </div>

                            {/* Telegram Integration Option */}
                            <div className="setting-group">
                                <label className="setting-label">TELEGRAM BOT TOKEN:</label>
                                <input
                                    type="password"
                                    className="nier-input"
                                    placeholder="Enter Telegram Bot Token"
                                    value={telegramToken}
                                    onChange={(e) => handleSaveTelegramToken(e.target.value)}
                                />
                                <div style={{ fontSize: '10px', marginTop: '4px', opacity: 0.7, color: 'var(--color-fg-sub)' }}>
                                    Create a bot via @BotFather. Copy-paste token here to post notes from Telegram.
                                </div>
                            </div>

                            {/* Home Address */}
                            <div className="setting-group">
                                <label className="setting-label">HOME ADDRESS:</label>
                                <input
                                    type="text"
                                    className="nier-input"
                                    placeholder="e.g. 123 Main St, Toronto, ON"
                                    value={userAddress}
                                    onChange={(e) => {
                                        setUserAddress(e.target.value);
                                        localStorage.setItem('projector_user_address', e.target.value);
                                    }}
                                />
                                <div style={{ fontSize: '10px', marginTop: '4px', opacity: 0.7, color: 'var(--color-fg-sub)' }}>
                                    Used for weather, directions, and location-aware voice commands.
                                </div>
                            </div>
                            
                            {/* Bambu Lab Settings */}
                            <div className="setting-group">
                                <label className="setting-label">BAMBU LAB PRINTER (LAN MODE):</label>
                                <input
                                    type="text"
                                    className="nier-input"
                                    placeholder="IP Address (e.g. 192.168.1.50)"
                                    value={bambuConfig.ip}
                                    style={{marginBottom: '5px'}}
                                    onChange={(e) => {
                                        setBambuConfig(prev => ({...prev, ip: e.target.value}));
                                        localStorage.setItem('projector_bambu_ip', e.target.value);
                                    }}
                                />
                                <input
                                    type="text"
                                    className="nier-input"
                                    placeholder="Serial Number (15 digits)"
                                    value={bambuConfig.serial}
                                    style={{marginBottom: '5px'}}
                                    onChange={(e) => {
                                        setBambuConfig(prev => ({...prev, serial: e.target.value}));
                                        localStorage.setItem('projector_bambu_serial', e.target.value);
                                    }}
                                />
                                <input
                                    type="password"
                                    className="nier-input"
                                    placeholder="Access Code (LAN Mode Password)"
                                    value={bambuConfig.accessCode}
                                    onChange={(e) => {
                                        setBambuConfig(prev => ({...prev, accessCode: e.target.value}));
                                        localStorage.setItem('projector_bambu_access', e.target.value);
                                    }}
                                />
                                <div style={{ fontSize: '10px', marginTop: '4px', opacity: 0.7, color: 'var(--color-fg-sub)' }}>
                                    Requires LAN Only mode or Developer Mode enabled on the printer.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Text transcript in a box */}
            {speechTranscript && (
                <div className="speech-transcript-box">
                    "{speechTranscript}"
                </div>
            )}

            {/* View Toast */}
            {viewToast && (
                <div className="view-toast">
                    {viewToast}
                </div>
            )}

            <div className="page-transition-wrapper" key={currentViewIndex}>
                {currentViewIndex === 0 && (
                    <>
            {/* Notes Widget */}
            <Widget
                id="notes-widget"
                title="// NOTES"
                defaultPos={{ x: 50, y: 50 }}
                defaultSize={{ w: 400, h: 300 }}
                editModeWidgetId={editModeWidgetId}
                setEditModeWidgetId={setEditModeWidgetId}
                headerAction={
                    <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
                        <button 
                            className="widget-header-btn" 
                            onClick={(e) => { e.stopPropagation(); setShowGraph(!showGraph); setShowGeminiConfig(false); }}
                            tabIndex={editModeWidgetId === 'notes-widget' ? 0 : -1}
                        >
                            {showGraph ? '[ NOTES ]' : '[ GRAPH ]'}
                        </button>
                        <button 
                            className="widget-header-btn" 
                            onClick={(e) => { e.stopPropagation(); setShowGeminiConfig(!showGeminiConfig); setShowGraph(false); }}
                            tabIndex={editModeWidgetId === 'notes-widget' ? 0 : -1}
                        >
                            {showGeminiConfig ? '[ CLOSE ]' : '[ SETTINGS ]'}
                        </button>
                    </div>
                }
            >
                {showGeminiConfig ? (
                    <div className="gemini-config">
                        <p className="config-desc">OBSIDIAN INTEGRATION:</p>
                        <input
                            type="text"
                            className="nier-input"
                            placeholder="Absolute path to Obsidian .md file"
                            value={obsidianPath}
                            onChange={(e) => setObsidianPath(e.target.value)}
                            onBlur={() => {
                                window.electronAPI.setObsidianPath(obsidianPath);
                                // Force reload of notes when path changes manually
                                window.electronAPI.readObsidianNote().then(text => {
                                    if (text !== null) setNotesText(text);
                                });
                            }}
                            tabIndex={editModeWidgetId === 'notes-widget' ? 0 : -1}
                            style={{ marginBottom: '15px' }}
                        />
                        <p className="config-desc">GEMINI WAKE COMMAND SETTINGS:</p>
                        <ol className="config-steps">
                            <li>Hold **Right Alt** (or **AltGraph**) to talk to Lumos.</li>
                            <li>Or say **"Lumos"** to auto-start command listening!</li>
                            <li>Say **"Nox"** to erase your notepad.</li>
                            <li>Say **"Dabbu"** to cycle themes.</li>
                        </ol>
                        <input
                            type="password"
                            className="nier-input"
                            placeholder="Gemini API Key"
                            value={geminiApiKey}
                            onChange={(e) => handleSaveGeminiKey(e.target.value)}
                            tabIndex={editModeWidgetId === 'notes-widget' ? 0 : -1}
                        />
                    </div>
                ) : showGraph ? (
                    <div style={{ flex: 1, position: 'relative' }}>
                        <KnowledgeGraph />
                    </div>
                ) : (
                    <textarea
                        id="notes-editor"
                        className="notes-textarea"
                        value={notesText}
                        onChange={(e) => setNotesText(e.target.value)}
                        placeholder="// Click to type notes here... say 'Lumos, append note' or 'Lumos, remove [keyword]'"
                        spellCheck="false"
                        tabIndex={editModeWidgetId === 'notes-widget' ? 0 : -1}
                        style={{ width: '100%', height: '100%', resize: 'none', background: 'transparent', border: 'none', outline: 'none' }}
                    />
                )}
            </Widget>


            {/* Audio Widget */}
            <Widget
                id="audio-widget"
                title="// NOW PLAYING"
                defaultPos={{ x: 50, y: 400 }}
                defaultSize={{ w: 350, h: 160 }}
                editModeWidgetId={editModeWidgetId}
                setEditModeWidgetId={setEditModeWidgetId}
                headerAction={
                    <button 
                        className="widget-header-btn" 
                        onClick={(e) => { e.stopPropagation(); setShowControls(!showControls); }}
                        style={{ marginLeft: 'auto' }}
                        tabIndex={editModeWidgetId === 'audio-widget' ? 0 : -1}
                    >
                        {showControls ? '[ HIDE ADJ ]' : '[ ADJ ]'}
                    </button>
                }
            >
                <div className="audio-body">
                    <div className={`wave-visualizer ${!audioConnected ? 'idle' : ''}`}>
                        {visualizerBars.map((ref, idx) => (
                            <div key={idx} ref={ref} className="bar" />
                        ))}
                    </div>
                    <div className="track-info">
                        <input
                            type="text"
                            id="track-input"
                            className="nier-input track-title"
                            placeholder="Track Name"
                            value={track}
                            onChange={handleTrackChange}
                            spellCheck="false"
                            tabIndex={editModeWidgetId === 'audio-widget' ? 0 : -1}
                        />
                        <input
                            type="text"
                            id="artist-input"
                            className="nier-input artist-name"
                            placeholder="Artist"
                            value={artist}
                            onChange={handleArtistChange}
                            spellCheck="false"
                            tabIndex={editModeWidgetId === 'audio-widget' ? 0 : -1}
                        />
                        {showControls && (
                            <div className="audio-controls">
                                <button className="ctrl-btn" title="Previous Track" onClick={() => window.electronAPI && window.electronAPI.mediaControl('prev')} tabIndex={editModeWidgetId === 'audio-widget' ? 0 : -1}>[|&lt;]</button>
                                <button className="ctrl-btn" title="Volume Down" onClick={() => window.electronAPI && window.electronAPI.mediaControl('volume-down')} tabIndex={editModeWidgetId === 'audio-widget' ? 0 : -1}>[- VOL]</button>
                                <button className="ctrl-btn play-pause-btn" title="Play / Pause" onClick={() => window.electronAPI && window.electronAPI.mediaControl('play-pause')} tabIndex={editModeWidgetId === 'audio-widget' ? 0 : -1}>[&gt;||]</button>
                                <button className="ctrl-btn" title="Volume Up" onClick={() => window.electronAPI && window.electronAPI.mediaControl('volume-up')} tabIndex={editModeWidgetId === 'audio-widget' ? 0 : -1}>[+ VOL]</button>
                                <button className="ctrl-btn" title="Next Track" onClick={() => window.electronAPI && window.electronAPI.mediaControl('next')} tabIndex={editModeWidgetId === 'audio-widget' ? 0 : -1}>[&gt;|]</button>
                            </div>
                        )}
                    </div>
                </div>
            </Widget>

            {/* Calendar Widget */}
            <Widget
                id="calendar-widget"
                title="// SCHEDULE"
                defaultPos={{ x: 500, y: 50 }}
                defaultSize={{ w: 450, h: 510 }}
                editModeWidgetId={editModeWidgetId}
                setEditModeWidgetId={setEditModeWidgetId}
                headerAction={
                    <button 
                        className="widget-header-btn" 
                        onClick={(e) => { e.stopPropagation(); setShowCalConfig(!showCalConfig); }}
                        style={{ marginLeft: 'auto' }}
                        tabIndex={editModeWidgetId === 'calendar-widget' ? 0 : -1}
                    >
                        {showCalConfig ? '[ CLOSE ]' : '[ CONFIG ]'}
                    </button>
                }
            >
                <div className="calendar-body">
                    {showCalConfig ? (
                        <div className="calendar-config">
                            <p className="config-desc">SETUP GOOGLE CALENDAR:</p>
                            <ol className="config-steps">
                                <li>Go to the Google Cloud Console.</li>
                                <li>Create a project, enable Calendar API.</li>
                                <li>Create OAuth Client ID (Desktop App).</li>
                                <li>Paste client credentials below.</li>
                            </ol>
                            <input
                                type="text"
                                className="nier-input"
                                placeholder="OAuth Client ID"
                                value={clientId}
                                onChange={(e) => setClientId(e.target.value)}
                                tabIndex={editModeWidgetId === 'calendar-widget' ? 0 : -1}
                            />
                            <input
                                type="password"
                                className="nier-input"
                                placeholder="OAuth Client Secret"
                                value={clientSecret}
                                onChange={(e) => setClientSecret(e.target.value)}
                                tabIndex={editModeWidgetId === 'calendar-widget' ? 0 : -1}
                            />
                            <div className="config-actions">
                                <button className="config-btn" onClick={handleLinkGoogle} tabIndex={editModeWidgetId === 'calendar-widget' ? 0 : -1}>[ LINK GOOGLE ]</button>
                                {calendarStatus !== 'unlinked' && (
                                    <button className="config-btn unlink" onClick={handleUnlinkGoogle} tabIndex={editModeWidgetId === 'calendar-widget' ? 0 : -1}>[ UNLINK ]</button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="calendar-events-list">
                            {calendarStatus === 'unlinked' && (
                                <div className="calendar-prompt">
                                    <p>GOOGLE CALENDAR NOT LINKED</p>
                                    <button className="config-btn" onClick={() => setShowCalConfig(true)} tabIndex={editModeWidgetId === 'calendar-widget' ? 0 : -1}>[ CONFIGURE ]</button>
                                </div>
                            )}
                            {calendarStatus === 'loading' && <div className="calendar-status">FETCHING EVENTS...</div>}
                            {calendarStatus === 'error' && <div className="calendar-status error">FAILED TO LOAD EVENTS</div>}
                            {calendarStatus === 'linked' && calendarEvents.length === 0 && (
                                <div className="calendar-status">NO UPCOMING EVENTS TODAY</div>
                            )}
                            {calendarStatus === 'linked' && calendarEvents.map(event => {
                                const startDateTime = event.start.dateTime || event.start.date;
                                const startDate = new Date(startDateTime);
                                
                                const timeStr = event.start.dateTime 
                                    ? startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                                    : 'ALL DAY';
                                    
                                const dateStr = startDate.toLocaleDateString([], { month: 'short', day: '2-digit' });
                                
                                return (
                                    <div key={event.id} className="calendar-event-card">
                                        <div className="event-time-badge">
                                            <span className="event-date">{dateStr}</span>
                                            <span className="event-time">{timeStr}</span>
                                        </div>
                                        <div className="event-details">
                                            <span className="event-summary">{event.summary || 'NO TITLE'}</span>
                                            {event.location && (
                                                <span className="event-location">@ {event.location}</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </Widget>

                {/* Clock & Stopwatch Widget */}
                <ClockWidget 
                    editModeWidgetId={editModeWidgetId}
                    setEditModeWidgetId={setEditModeWidgetId}
                />
                </>
                )}

                {currentViewIndex === 1 && (
                    <>
                    <CronWidget 
                        editModeWidgetId={editModeWidgetId} 
                        setEditModeWidgetId={setEditModeWidgetId} 
                    />
                    </>
                )}

                {currentViewIndex === 2 && (
                    <>
                    <BambuWidget 
                        editModeWidgetId={editModeWidgetId} 
                        setEditModeWidgetId={setEditModeWidgetId} 
                    />
                    <SystemStatsWidget 
                        editModeWidgetId={editModeWidgetId} 
                        setEditModeWidgetId={setEditModeWidgetId} 
                    />
                    </>
                )}
            </div>

            {/* EMOPET Companion (Free-roaming) */}
            <Companion 
                isRecording={isRecording} 
                isProcessing={isProcessing} 
                audioConnected={audioConnected} 
                voiceLang="en-GB"
            />
        </div>
    );
}

export default App;
