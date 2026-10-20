import React, { useState, useEffect } from 'react';
import Widget from './Widget';

export default function BambuWidget({ editModeWidgetId, setEditModeWidgetId }) {
    const [status, setStatus] = useState(null);

    useEffect(() => {
        if (!window.electronAPI) return;

        let interval;
        const fetchStatus = async () => {
            const data = await window.electronAPI.getBambuStatus();
            setStatus(data);
        };

        fetchStatus();
        interval = setInterval(fetchStatus, 3000); // Poll every 3 seconds

        return () => clearInterval(interval);
    }, []);

    const sendCommand = async (command) => {
        if (window.electronAPI) {
            await window.electronAPI.sendBambuCommand(command);
        }
    };

    return (
        <Widget
            id="bambu-widget"
            title="// BAMBU LAB PRINTER"
            defaultPos={{ x: 50, y: 150 }}
            defaultSize={{ w: 350, h: 250 }}
            editModeWidgetId={editModeWidgetId}
            setEditModeWidgetId={setEditModeWidgetId}
        >
            <div style={{ padding: '10px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
                {!status || !status.connected ? (
                    <div style={{ margin: 'auto', opacity: 0.5 }}>Printer Offline / Disconnected</div>
                ) : (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                            <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>{status.gcode_state}</span>
                            <span>WiFi: {status.wifi_signal}</span>
                        </div>
                        
                        <div style={{ marginBottom: '15px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                                <span>Progress: {status.mc_percent}%</span>
                                <span>Remaining: {status.mc_remaining_time} min</span>
                            </div>
                            <div style={{ width: '100%', height: '8px', background: 'var(--color-bg-alt)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${status.mc_percent}%`, background: 'var(--color-primary)' }}></div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', fontSize: '14px' }}>
                            <div>
                                <div style={{ opacity: 0.7, fontSize: '10px' }}>NOZZLE</div>
                                {status.nozzle_temp}°C / {status.nozzle_target_temp}°C
                            </div>
                            <div>
                                <div style={{ opacity: 0.7, fontSize: '10px' }}>BED</div>
                                {status.bed_temp}°C / {status.bed_target_temp}°C
                            </div>
                        </div>

                        <div style={{ marginTop: 'auto', display: 'flex', gap: '5px' }}>
                            <button 
                                className="nier-btn" 
                                style={{ flex: 1, padding: '5px' }}
                                onClick={() => sendCommand('pause')}
                                tabIndex={editModeWidgetId === 'bambu-widget' ? 0 : -1}
                            >
                                Pause
                            </button>
                            <button 
                                className="nier-btn" 
                                style={{ flex: 1, padding: '5px' }}
                                onClick={() => sendCommand('resume')}
                                tabIndex={editModeWidgetId === 'bambu-widget' ? 0 : -1}
                            >
                                Resume
                            </button>
                            <button 
                                className="nier-btn" 
                                style={{ flex: 1, padding: '5px', borderColor: 'var(--color-error, red)' }}
                                onClick={() => sendCommand('stop')}
                                tabIndex={editModeWidgetId === 'bambu-widget' ? 0 : -1}
                            >
                                Stop
                            </button>
                        </div>
                    </>
                )}
            </div>
        </Widget>
    );
}
