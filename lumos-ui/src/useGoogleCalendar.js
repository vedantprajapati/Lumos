import { useState, useEffect } from 'react';

export function useGoogleCalendar(clientId, clientSecret) {
    const [calendarEvents, setCalendarEvents] = useState([]);
    const [calendarStatus, setCalendarStatus] = useState('unlinked'); // 'unlinked', 'loading', 'linked', 'error'

    const fetchCalendarEvents = async () => {
        if (!window.electronAPI) return;
        try {
            const tokens = await window.electronAPI.getCalendarTokens();
            if (!tokens || !tokens.accessToken) {
                setCalendarStatus('unlinked');
                setCalendarEvents([]);
                return;
            }
            
            setCalendarStatus('loading');
            const timeMin = new Date().toISOString();
            const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&maxResults=8&orderBy=startTime&singleEvents=true`;
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${tokens.accessToken}`
                }
            });
            
            if (response.status === 401) {
                setCalendarStatus('unlinked');
                return;
            }
            
            const data = await response.json();
            if (data.items) {
                setCalendarEvents(data.items);
                setCalendarStatus('linked');
            } else {
                setCalendarStatus('error');
            }
        } catch (e) {
            console.error("Failed to fetch calendar events:", e);
            setCalendarStatus('error');
        }
    };

    useEffect(() => {
        fetchCalendarEvents();
        const interval = setInterval(fetchCalendarEvents, 15 * 60 * 1000); // 15 mins
        return () => clearInterval(interval);
    }, []);

    const handleLinkGoogle = () => {
        if (!clientId || !clientSecret) {
            alert("Please fill in both Client ID and Client Secret!");
            return;
        }
        localStorage.setItem('projector_google_client_id', clientId);
        localStorage.setItem('projector_google_client_secret', clientSecret);
        if (window.electronAPI) {
            window.electronAPI.googleCalendarAuth(clientId, clientSecret);
        }
    };

    const handleUnlinkGoogle = async () => {
        if (window.electronAPI) {
            await window.electronAPI.clearCalendarTokens();
            setCalendarStatus('unlinked');
            setCalendarEvents([]);
        }
    };

    useEffect(() => {
        if (window.electronAPI) {
            window.electronAPI.onCalendarAuthSuccess(() => {
                fetchCalendarEvents();
            });
        }
    }, []);

    return {
        calendarEvents,
        calendarStatus,
        fetchCalendarEvents,
        handleLinkGoogle,
        handleUnlinkGoogle
    };
}
