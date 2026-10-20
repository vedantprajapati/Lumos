import React, { useState, useEffect, useRef } from 'react';
import Widget from './Widget';

export const formatStopwatch = (totalSecs) => {
    const h = Math.floor(totalSecs / 3600).toString().padStart(2, '0');
    const m = Math.floor((totalSecs % 3600) / 60).toString().padStart(2, '0');
    const s = (totalSecs % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
};

export default function ClockWidget({ editModeWidgetId, setEditModeWidgetId }) {
    // Live Clock State
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);

    // Stopwatch State
    const [swTime, setSwTime] = useState(0);
    const [swActive, setSwActive] = useState(false);
    const swIntervalRef = useRef(null);

    useEffect(() => {
        if (swActive) {
            swIntervalRef.current = setInterval(() => {
                setSwTime(prev => prev + 1);
            }, 1000);
        } else {
            if (swIntervalRef.current) clearInterval(swIntervalRef.current);
        }
        return () => {
            if (swIntervalRef.current) clearInterval(swIntervalRef.current);
        };
    }, [swActive]);

    const handleClockKeyDown = (e) => {
        if (e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setSwActive(prev => !prev);
        } else if (e.key === 'Backspace' || e.key === 'r' || e.key === 'R') {
            e.preventDefault();
            e.stopPropagation();
            setSwActive(false);
            setSwTime(0);
        }
    };

    return (
        <Widget
            id="clock-widget"
            title="// CHRONOS"
            defaultPos={{ x: 50, y: 580 }}
            defaultSize={{ w: 350, h: 150 }}
            editModeWidgetId={editModeWidgetId}
            setEditModeWidgetId={setEditModeWidgetId}
        >
            <div 
                className="clock-body"
                onKeyDown={handleClockKeyDown}
                tabIndex={editModeWidgetId === 'clock-widget' ? 0 : -1}
                style={{ outline: 'none', width: '100%', height: '100%' }}
            >
                <div className="clock-time-display">
                    {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                </div>
                <div className="clock-date-display">
                    {time.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
                <div className="stopwatch-container">
                    <span className="stopwatch-label">SW:</span>
                    <span className={`stopwatch-time ${swActive ? 'active' : ''}`}>{formatStopwatch(swTime)}</span>
                    {editModeWidgetId === 'clock-widget' && (
                        <span className="stopwatch-instructions"> [SPACE: START/PAUSE] [BACKSPACE: RESET]</span>
                    )}
                </div>
            </div>
        </Widget>
    );
}
