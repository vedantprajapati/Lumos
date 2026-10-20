import mqtt from 'mqtt';

let client = null;
let printerStatus = {
    connected: false,
    print_error: 0,
    gcode_state: 'UNKNOWN', // RUNNING, FINISH, FAILED, PREPARE, PAUSE
    mc_percent: 0,
    mc_remaining_time: 0,
    bed_temp: 0,
    bed_target_temp: 0,
    nozzle_temp: 0,
    nozzle_target_temp: 0,
    chamber_temp: 0,
    wifi_signal: 'unknown',
    spd_mag: 100, // speed
    spd_lvl: 1, // 1=Normal, 2=Sport, 3=Ludicrous, 4=Silent
};

let config = {
    ip: '',
    serial: '',
    accessCode: ''
};

let commandSequence = 1000;

function connect(ip, serial, accessCode, onStatusUpdate) {
    if (client) {
        client.end();
    }
    
    config = { ip, serial, accessCode };
    
    if (!ip || !serial || !accessCode) {
        console.log("[Bambu] Missing configuration, cannot connect.");
        return;
    }

    console.log(`[Bambu] Connecting to mqtts://${ip}:8883...`);
    client = mqtt.connect(`mqtts://${ip}:8883`, {
        username: 'bblp',
        password: accessCode,
        rejectUnauthorized: false // Required for Bambu Lab local self-signed certs
    });

    client.on('connect', () => {
        console.log('[Bambu] Connected to printer!');
        printerStatus.connected = true;
        if (onStatusUpdate) onStatusUpdate(printerStatus);
        
        // Subscribe to report topic
        client.subscribe(`device/${serial}/report`, (err) => {
            if (err) console.error('[Bambu] Failed to subscribe to report topic:', err);
        });
    });

    client.on('error', (err) => {
        console.error('[Bambu] Connection error:', err);
        printerStatus.connected = false;
        if (onStatusUpdate) onStatusUpdate(printerStatus);
    });

    client.on('offline', () => {
        console.log('[Bambu] Printer went offline.');
        printerStatus.connected = false;
        if (onStatusUpdate) onStatusUpdate(printerStatus);
    });

    client.on('message', (topic, message) => {
        try {
            const data = JSON.parse(message.toString());
            if (data.print) {
                const print = data.print;
                let updated = false;

                if (print.gcode_state !== undefined) { printerStatus.gcode_state = print.gcode_state; updated = true; }
                if (print.mc_percent !== undefined) { printerStatus.mc_percent = print.mc_percent; updated = true; }
                if (print.mc_remaining_time !== undefined) { printerStatus.mc_remaining_time = print.mc_remaining_time; updated = true; }
                if (print.bed_temper !== undefined) { printerStatus.bed_temp = print.bed_temper; updated = true; }
                if (print.bed_target_temper !== undefined) { printerStatus.bed_target_temp = print.bed_target_temper; updated = true; }
                if (print.nozzle_temper !== undefined) { printerStatus.nozzle_temp = print.nozzle_temper; updated = true; }
                if (print.nozzle_target_temper !== undefined) { printerStatus.nozzle_target_temp = print.nozzle_target_temper; updated = true; }
                if (print.chamber_temper !== undefined) { printerStatus.chamber_temp = print.chamber_temper; updated = true; }
                if (print.wifi_signal !== undefined) { printerStatus.wifi_signal = print.wifi_signal; updated = true; }
                if (print.print_error !== undefined) { printerStatus.print_error = print.print_error; updated = true; }
                if (print.spd_mag !== undefined) { printerStatus.spd_mag = print.spd_mag; updated = true; }
                if (print.spd_lvl !== undefined) { printerStatus.spd_lvl = print.spd_lvl; updated = true; }

                if (updated && onStatusUpdate) {
                    onStatusUpdate(printerStatus);
                }
            }
        } catch (e) {
            console.error('[Bambu] Failed to parse message:', e);
        }
    });
}

function sendCommand(command) {
    if (!client || !client.connected || !config.serial) {
        console.error('[Bambu] Cannot send command, not connected.');
        return false;
    }

    commandSequence++;
    let payload = null;

    if (command === 'pause') {
        payload = {
            print: {
                sequence_id: commandSequence.toString(),
                command: "pause"
            }
        };
    } else if (command === 'resume') {
        payload = {
            print: {
                sequence_id: commandSequence.toString(),
                command: "resume"
            }
        };
    } else if (command === 'stop') {
        payload = {
            print: {
                sequence_id: commandSequence.toString(),
                command: "stop"
            }
        };
    } else {
        console.error('[Bambu] Unknown command:', command);
        return false;
    }

    client.publish(`device/${config.serial}/request`, JSON.stringify(payload), (err) => {
        if (err) console.error('[Bambu] Failed to publish command:', err);
    });

    return true;
}

function getStatus() {
    return printerStatus;
}

export default {
    connect,
    sendCommand,
    getStatus
};
