import React, { useState, useEffect } from 'react';
import Widget from './Widget';

export default function SystemStatsWidget({ editModeWidgetId, setEditModeWidgetId }) {
    const [stats, setStats] = useState(null);

    useEffect(() => {
        if (!window.electronAPI) return;

        let interval;
        const fetchStats = async () => {
            const data = await window.electronAPI.getSystemStats();
            setStats(data);
        };

        fetchStats();
        interval = setInterval(fetchStats, 2000); // Poll every 2 seconds

        return () => clearInterval(interval);
    }, []);

    const formatBytes = (bytes) => {
        if (!bytes) return '0 GB';
        return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
    };

    return (
        <Widget
            id="sys-stats-widget"
            title="// SYSTEM DIAGNOSTICS"
            defaultPos={{ x: 420, y: 150 }}
            defaultSize={{ w: 350, h: 300 }}
            editModeWidgetId={editModeWidgetId}
            setEditModeWidgetId={setEditModeWidgetId}
        >
            <div style={{ padding: '10px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto' }}>
                {!stats ? (
                    <div style={{ margin: 'auto', opacity: 0.5 }}>Loading Diagnostics...</div>
                ) : (
                    <>
                        {/* CPU & Memory */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                                <div style={{ fontSize: '10px', opacity: 0.7, marginBottom: '2px' }}>CPU LOAD</div>
                                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{Math.round(stats.cpuLoad)}%</div>
                                <div style={{ width: '100%', height: '4px', background: 'var(--color-bg-alt)', marginTop: '4px' }}>
                                    <div style={{ height: '100%', width: `${stats.cpuLoad}%`, background: 'var(--color-primary)' }}></div>
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '10px', opacity: 0.7, marginBottom: '2px' }}>MEMORY</div>
                                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                                    {Math.round((stats.memUsed/stats.memTotal)*100)}%
                                </div>
                                <div style={{ width: '100%', height: '4px', background: 'var(--color-bg-alt)', marginTop: '4px' }}>
                                    <div style={{ height: '100%', width: `${(stats.memUsed/stats.memTotal)*100}%`, background: 'var(--color-primary)' }}></div>
                                </div>
                            </div>
                        </div>

                        {/* Temps */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                                <div style={{ fontSize: '10px', opacity: 0.7, marginBottom: '2px' }}>CPU TEMP</div>
                                <div style={{ fontSize: '16px' }}>{stats.cpuTemp ? `${Math.round(stats.cpuTemp)}°C` : 'N/A'}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '10px', opacity: 0.7, marginBottom: '2px' }}>GPU TEMP</div>
                                <div style={{ fontSize: '16px' }}>{stats.gpuTemp ? `${Math.round(stats.gpuTemp)}°C` : 'N/A'}</div>
                            </div>
                        </div>

                        {/* Filesystems */}
                        <div>
                            <div style={{ fontSize: '10px', opacity: 0.7, marginBottom: '6px' }}>STORAGE VOLUMES</div>
                            {stats.fs && stats.fs.map((drive, idx) => (
                                <div key={idx} style={{ marginBottom: '8px', fontSize: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                        <span>{drive.mount}</span>
                                        <span>{drive.use}% ({formatBytes(drive.used)} / {formatBytes(drive.size)})</span>
                                    </div>
                                    <div style={{ width: '100%', height: '4px', background: 'var(--color-bg-alt)' }}>
                                        <div style={{ height: '100%', width: `${drive.use}%`, background: 'var(--color-primary)' }}></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </Widget>
    );
}
