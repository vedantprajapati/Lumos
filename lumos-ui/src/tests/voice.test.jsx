import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import App from '../App';

// Setup Mock Environment
beforeEach(() => {
    vi.stubGlobal('electronAPI', {
        onCalendarAuthSuccess: vi.fn(),
        onExternalNoteAdded: vi.fn(),
        onNowPlayingUpdate: vi.fn(),
        getCalendarTokens: vi.fn().mockResolvedValue({ accessToken: 'mock_token' }),
        mediaControl: vi.fn(),
        clearCalendarTokens: vi.fn(),
        isFullscreen: vi.fn().mockResolvedValue(false)
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ items: [] })
    }));

    vi.stubGlobal('navigator', {
        mediaDevices: {
            getUserMedia: vi.fn().mockResolvedValue({
                getTracks: () => [{ stop: vi.fn() }]
            }),
            getDisplayMedia: vi.fn().mockResolvedValue({
                getTracks: () => [{ stop: vi.fn() }]
            }),
            enumerateDevices: vi.fn().mockResolvedValue([])
        }
    });

    const mockRecognitionInstance = {
        start: vi.fn(function() {
            if (this.onstart) this.onstart();
        }),
        stop: vi.fn(),
        abort: vi.fn(),
        continuous: false,
        interimResults: false,
        lang: 'en-US',
        onstart: null,
        onresult: null,
        onend: null,
        onerror: null
    };

    function MockSpeechRecognition() {
        return mockRecognitionInstance;
    }
    vi.stubGlobal('webkitSpeechRecognition', MockSpeechRecognition);
    vi.stubGlobal('SpeechRecognition', MockSpeechRecognition);

    function MockAudioContext() {
        return {
            createAnalyser: () => ({ 
                fftSize: 32, 
                frequencyBinCount: 16, 
                getByteFrequencyData: vi.fn() 
            }),
            createMediaStreamSource: () => ({ 
                connect: vi.fn(),
                disconnect: vi.fn()
            }),
            close: vi.fn(),
            state: 'suspended',
            resume: vi.fn()
        };
    }
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('webkitAudioContext', MockAudioContext);

    localStorage.clear();
});

describe('Lumos Voice Assistant integration in App', () => {
    it('renders all widgets on mounting', async () => {
        await act(async () => {
            render(<App />);
        });
        
        expect(screen.getByText('// NOTES')).toBeInTheDocument();
        expect(screen.getByText('// NOW PLAYING')).toBeInTheDocument();
        expect(screen.getByText('// SCHEDULE')).toBeInTheDocument();
        expect(screen.getByText('// CHRONO')).toBeInTheDocument();
    });

    it('sets initial Gemini API key on mounting', async () => {
        await act(async () => {
            render(<App />);
        });
        
        expect(localStorage.getItem('projector_gemini_api_key')).toBe('AIzaSyB2qyP9G_v7v76BJsYG13azPXB4Q25FSjY');
    });

    it('displays listening overlay when isRecording or isProcessing states are triggered', async () => {
        await act(async () => {
            render(<App />);
        });

        // Trigger AltRight keydown to activate listener session
        const container = document.querySelector('.app-container');
        await act(async () => {
            fireEvent.keyDown(window, { key: 'AltGraph', code: 'AltRight' });
        });

        expect(screen.getByText('// LUMOS LISTENING...')).toBeInTheDocument();
    });
});
