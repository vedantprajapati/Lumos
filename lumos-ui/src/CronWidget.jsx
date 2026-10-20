import React, { useState, useEffect } from 'react';
import Widget from './Widget';

const CronWidget = ({ editModeWidgetId, setEditModeWidgetId }) => {
    const [jobs, setJobs] = useState([]);
    const [newJobName, setNewJobName] = useState('');
    const [newJobSchedule, setNewJobSchedule] = useState('* * * * *');
    const [showConfig, setShowConfig] = useState(false);

    useEffect(() => {
        if (window.electronAPI && window.electronAPI.getCronjobs) {
            window.electronAPI.getCronjobs().then(setJobs).catch(console.error);
        }
    }, []);

    const handleSaveJob = async () => {
        if (!newJobName || !newJobSchedule) return;
        const job = {
            id: Date.now().toString(),
            name: newJobName,
            schedule: newJobSchedule,
            active: true
        };
        if (window.electronAPI && window.electronAPI.saveCronjob) {
            const updated = await window.electronAPI.saveCronjob(job);
            setJobs(updated);
            setNewJobName('');
        }
    };

    const handleDelete = async (id) => {
        if (window.electronAPI && window.electronAPI.deleteCronjob) {
            const updated = await window.electronAPI.deleteCronjob(id);
            setJobs(updated);
        }
    };

    const toggleJob = async (job) => {
        const updatedJob = { ...job, active: !job.active };
        if (window.electronAPI && window.electronAPI.saveCronjob) {
            const updated = await window.electronAPI.saveCronjob(updatedJob);
            setJobs(updated);
        }
    };

    return (
        <Widget
            id="cron-widget"
            title="// CRONS"
            defaultPos={{ x: 500, y: 50 }}
            defaultSize={{ w: 350, h: 250 }}
            editModeWidgetId={editModeWidgetId}
            setEditModeWidgetId={setEditModeWidgetId}
            headerAction={
                <button 
                    className="widget-header-btn" 
                    onClick={(e) => { e.stopPropagation(); setShowConfig(!showConfig); }}
                >
                    {showConfig ? '[ CLOSE ]' : '[ ADD ]'}
                </button>
            }
        >
            {showConfig && (
                <div style={{ padding: '10px', borderBottom: '1px solid var(--nier-border)', marginBottom: '10px' }}>
                    <input 
                        type="text" 
                        className="nier-input" 
                        placeholder="Job Name (e.g. Morning Briefing)" 
                        value={newJobName} 
                        onChange={e => setNewJobName(e.target.value)} 
                        style={{ marginBottom: '5px' }}
                    />
                    <input 
                        type="text" 
                        className="nier-input" 
                        placeholder="Cron (e.g. 0 9 * * *)" 
                        value={newJobSchedule} 
                        onChange={e => setNewJobSchedule(e.target.value)} 
                        style={{ marginBottom: '5px' }}
                    />
                    <button className="widget-header-btn" onClick={handleSaveJob} style={{ width: '100%' }}>
                        [ SAVE SCHEDULE ]
                    </button>
                </div>
            )}
            
            <div style={{ overflowY: 'auto', flex: 1, padding: '5px' }}>
                {jobs.length === 0 ? (
                    <div style={{ color: 'var(--nier-text)', textAlign: 'center', marginTop: '20px', opacity: 0.5 }}>
                        NO SCHEDULES ACTIVE
                    </div>
                ) : (
                    jobs.map(job => (
                        <div key={job.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '8px 0' }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ color: job.active ? 'var(--nier-text)' : 'gray' }}>{job.name}</div>
                                <div style={{ fontSize: '10px', color: 'gray' }}>{job.schedule}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button className="widget-header-btn" onClick={() => toggleJob(job)}>
                                    {job.active ? '[ ON ]' : '[ OFF ]'}
                                </button>
                                <button className="widget-header-btn" style={{ color: 'darkred' }} onClick={() => handleDelete(job.id)}>
                                    [ X ]
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </Widget>
    );
};

export default CronWidget;
