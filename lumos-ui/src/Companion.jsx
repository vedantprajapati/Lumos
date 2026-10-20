import React, { useState, useEffect, useRef } from 'react';
import './index.css';

const Companion = ({ isRecording, isProcessing, isSpeaking, audioConnected }) => {
    const [state, setState] = useState('idle');
    const [pos, setPos] = useState({ x: 20, y: 80 });
    const [facing, setFacing] = useState(1);
    const [zIndex, setZIndex] = useState(20);
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const [mouthOpen, setMouthOpen] = useState(false);

    // UI state overrides
    useEffect(() => {
        if (isSpeaking) setState('speaking');
        else if (isProcessing) setState('thinking');
        else if (isRecording) setState('listening');
        else setState('idle');
    }, [isRecording, isProcessing, isSpeaking, audioConnected]);

    // Mouth animation when speaking or thinking
    useEffect(() => {
        if (state === 'speaking' || state === 'thinking') {
            const interval = setInterval(() => {
                setMouthOpen(prev => !prev);
            }, state === 'speaking' ? 150 : 400);
            return () => clearInterval(interval);
        } else {
            setMouthOpen(false);
        }
    }, [state]);

    // Blinking logic
    useEffect(() => {
        const loop = setInterval(() => {
            if (state === 'listening' || state === 'thinking' || state === 'speaking') return;

            // 10% chance to blink
            if (Math.random() > 0.9) {
                setState('blinking');
                setTimeout(() => setState('idle'), 200);
            } else {
                setState('idle');
            }
        }, 1000);
        return () => clearInterval(loop);
    }, [state]);

    // Drag handlers
    const handleMouseDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        dragOffset.current = {
            x: e.clientX - pos.x,
            y: e.clientY - pos.y
        };
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e) => {
            setPos({
                x: e.clientX - dragOffset.current.x,
                y: e.clientY - dragOffset.current.y
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    const getFace = () => {
        if (state === 'blinking') return '[-_-]';
        if (state === 'listening') return '[o_o]';
        if (state === 'speaking') return mouthOpen ? '[0_0]' : '[0‿0]';
        if (state === 'thinking') return mouthOpen ? '[~_~]' : '[~‿~]';
        return '[0_0]';
    };

    return (
        <div className="combat-arena">
            {/* Lumos */}
            <div 
                className={`lumos-sprite ${state}`}
                style={{
                    translate: `${pos.x}px ${pos.y}px`,
                    scale: `${facing} 1`,
                    zIndex: zIndex,
                    cursor: isDragging ? 'grabbing' : 'grab',
                    userSelect: 'none',
                    WebkitAppRegion: 'no-drag'
                }}
                onMouseDown={handleMouseDown}
            >
                <div style={{ fontSize: '32px', color: '#4cc9f0', fontWeight: 'bold' }}>{getFace()}</div>
                
                {/* Status Indicators overlaid on Lumos */}
                {isRecording && <div className="status-bubble listening">REC</div>}
                {isProcessing && <div className="status-bubble thinking">SYNC</div>}
                {isSpeaking && <div className="status-bubble speaking">♪</div>}
            </div>
        </div>
    );
};

export default Companion;
