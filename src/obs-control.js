/**
 * DualView - OBS Control Server
 * Version: 0.3.2
 *
 * Serveur de contrôle local pour l'intégration OBS (Méthode 1 + Méthode 3).
 *
 * Rôle :
 *   - Sert le dock OBS (page HTML statique) en HTTP local.
 *   - Expose une API de commande (HTTP POST + WebSocket) qui traduit les
 *     ordres entrants en commandes DualView via un callback unique
 *     `onCommand(action, payload)` fourni par main.js.
 *   - Diffuse l'état courant (sync, onglets, URL) aux clients connectés
 *     (dock + scripts OBS) via WebSocket pour un affichage temps réel.
 *
 * Conception ADDITIVE :
 *   - Aucune dépendance npm externe : http + le module 'ws' minimal réimplémenté
 *     n'est PAS utilisé ; on s'appuie sur un WebSocket maison léger basé sur le
 *     module 'http' + 'crypto' natifs pour éviter d'alourdir le bundle.
 *   - Si le serveur ne peut pas démarrer (port occupé, etc.), il logue et
 *     n'interrompt JAMAIS le fonctionnement de DualView.
 *
 * Sécurité :
 *   - Écoute UNIQUEMENT sur 127.0.0.1 (loopback) — jamais exposé au réseau.
 *   - Un token est généré au démarrage ; le dock le reçoit via l'URL servie.
 *     Les commandes HTTP/WS doivent présenter ce token (en-tête ou query).
 */

'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// ── État interne ──────────────────────────────────────────────────────────────
let server = null;
let token = null;
let currentPort = 0;
let onCommandCb = null;
let getStatusCb = null;
let logFn = (..._a) => {};

const wsClients = new Set();   // sockets WebSocket actifs

// Dernier état connu, diffusé aux nouveaux clients et après chaque changement
let lastStatus = { sync: 'paused', activeTabId: null, url: '', tabs: [] };

// ── Liste blanche des actions acceptées ────────────────────────────────────────
// Toute action hors de cette liste est ignorée (défense en profondeur).
const ALLOWED_ACTIONS = new Set([
    'sync-pause', 'sync-resume', 'sync-restart',
    'nav-back', 'nav-forward', 'nav-reload', 'nav-home',
    'navigate',
    'tab-new', 'tab-close', 'tab-switch',
    'get-status',
]);

// ── WebSocket minimal (RFC 6455, texte uniquement) ──────────────────────────────
function wsAccept(key) {
    return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}

function wsEncode(str) {
    const payload = Buffer.from(str, 'utf8');
    const len = payload.length;
    let header;
    if (len < 126) {
        header = Buffer.alloc(2);
        header[1] = len;
    } else if (len < 65536) {
        header = Buffer.alloc(4);
        header[1] = 126;
        header.writeUInt16BE(len, 2);
    } else {
        header = Buffer.alloc(10);
        header[1] = 127;
        header.writeUInt32BE(0, 2);
        header.writeUInt32BE(len, 6);
    }
    header[0] = 0x81; // FIN + opcode texte
    return Buffer.concat([header, payload]);
}

function wsDecode(buf) {
    // Décodage minimal d'une trame texte masquée (client → serveur)
    if (buf.length < 2) return null;
    const opcode = buf[0] & 0x0f;
    if (opcode === 0x8) return { close: true };       // close
    const masked = (buf[1] & 0x80) !== 0;
    let len = buf[1] & 0x7f;
    let offset = 2;
    if (len === 126) { len = buf.readUInt16BE(2); offset = 4; }
    else if (len === 127) { len = buf.readUInt32BE(6); offset = 10; }
    if (!masked) return null; // les clients DOIVENT masquer
    const mask = buf.slice(offset, offset + 4);
    offset += 4;
    const data = buf.slice(offset, offset + len);
    const out = Buffer.alloc(len);
    for (let i = 0; i < len; i++) out[i] = data[i] ^ mask[i % 4];
    return { text: out.toString('utf8') };
}

function broadcast(obj) {
    const frame = wsEncode(JSON.stringify(obj));
    for (const sock of wsClients) {
        try { sock.write(frame); } catch { /* socket mort, nettoyé sur 'close' */ }
    }
}

// ── Traitement d'une commande ───────────────────────────────────────────────────
function handleCommand(action, payload) {
    if (!ALLOWED_ACTIONS.has(action)) {
        logFn('obs', 'WARN', [`Action OBS inconnue ignorée: ${action}`]);
        return { ok: false, error: 'unknown_action' };
    }
    if (action === 'get-status') {
        return { ok: true, status: lastStatus };
    }
    try {
        if (typeof onCommandCb === 'function') onCommandCb(action, payload || {});
        return { ok: true };
    } catch (e) {
        logFn('obs', 'ERROR', [`Erreur commande ${action}: ${e.message}`]);
        return { ok: false, error: 'command_failed' };
    }
}

// ── Vérification du token ────────────────────────────────────────────────────────
function checkToken(req, urlObj) {
    const headerTok = req.headers['x-dualview-token'];
    const queryTok = urlObj.searchParams.get('token');
    return headerTok === token || queryTok === token;
}

// ── Serveur HTTP + upgrade WebSocket ─────────────────────────────────────────────
function createServer(dockHtmlPath) {
    const srv = http.createServer((req, res) => {
        const urlObj = new URL(req.url, `http://127.0.0.1:${currentPort}`);
        const pathname = urlObj.pathname;

        // CORS local uniquement (le dock OBS est servi par nous-mêmes)
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-DualView-Token');

        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

        // Page du dock — sert le HTML en injectant le token + port
        if (pathname === '/' || pathname === '/dock' || pathname === '/index.html') {
            try {
                let html = fs.readFileSync(dockHtmlPath, 'utf8');
                html = html
                    .replace(/__DUALVIEW_TOKEN__/g, token)
                    .replace(/__DUALVIEW_PORT__/g, String(currentPort));
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(html);
            } catch (e) {
                res.writeHead(500); res.end('dock unavailable');
            }
            return;
        }

        // API de commande HTTP (utilisée par les scripts OBS — Méthode 3)
        if (pathname === '/command' && req.method === 'POST') {
            if (!checkToken(req, urlObj)) { res.writeHead(403); res.end('forbidden'); return; }
            let body = '';
            req.on('data', c => { body += c; if (body.length > 1e5) req.destroy(); });
            req.on('end', () => {
                let parsed = {};
                try { parsed = body ? JSON.parse(body) : {}; } catch { /* ignore */ }
                const action = parsed.action || urlObj.searchParams.get('action');
                const result = handleCommand(action, parsed.payload || parsed);
                res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            });
            return;
        }

        // Statut en lecture seule (pratique pour debug / scripts)
        if (pathname === '/status' && req.method === 'GET') {
            if (!checkToken(req, urlObj)) { res.writeHead(403); res.end('forbidden'); return; }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(lastStatus));
            return;
        }

        res.writeHead(404); res.end('not found');
    });

    // Upgrade WebSocket (dock temps réel — Méthode 1)
    srv.on('upgrade', (req, socket) => {
        const urlObj = new URL(req.url, `http://127.0.0.1:${currentPort}`);
        if (!checkToken(req, urlObj)) { socket.destroy(); return; }
        const key = req.headers['sec-websocket-key'];
        if (!key) { socket.destroy(); return; }
        socket.write(
            'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            `Sec-WebSocket-Accept: ${wsAccept(key)}\r\n\r\n`
        );
        wsClients.add(socket);
        logFn('obs', 'LOG', [`Client dock connecté (${wsClients.size} actif(s))`]);

        // Envoyer l'état courant immédiatement
        try { socket.write(wsEncode(JSON.stringify({ type: 'status', status: lastStatus }))); } catch {}

        socket.on('data', buf => {
            const decoded = wsDecode(buf);
            if (!decoded) return;
            if (decoded.close) { socket.end(); return; }
            let msg = {};
            try { msg = JSON.parse(decoded.text); } catch { return; }
            const result = handleCommand(msg.action, msg.payload || {});
            // Répondre au client émetteur (accusé + statut éventuel)
            try { socket.write(wsEncode(JSON.stringify({ type: 'ack', action: msg.action, ...result }))); } catch {}
        });

        const cleanup = () => { wsClients.delete(socket); };
        socket.on('close', cleanup);
        socket.on('error', cleanup);
    });

    return srv;
}

// ── API publique ─────────────────────────────────────────────────────────────────
/**
 * Démarre le serveur de contrôle OBS.
 * @param {object} opts
 * @param {number} opts.port         Port souhaité (0 = aléatoire libre).
 * @param {string} opts.dockHtmlPath Chemin absolu vers obs-dock.html.
 * @param {function} opts.onCommand  (action, payload) => void
 * @param {function} [opts.logFn]    (source, level, argsArray) => void
 * @returns {Promise<{port:number, token:string}|null>} null si échec (non bloquant).
 */
function start(opts) {
    return new Promise((resolve) => {
        if (server) { resolve({ port: currentPort, token }); return; }
        onCommandCb = opts.onCommand;
        logFn = opts.logFn || logFn;
        token = crypto.randomBytes(24).toString('hex');

        server = createServer(opts.dockHtmlPath);

        server.once('error', (e) => {
            logFn('obs', 'ERROR', [`Serveur OBS non démarré: ${e.message}`]);
            server = null;
            resolve(null); // NON bloquant : DualView continue normalement
        });

        const wanted = Number.isInteger(opts.port) ? opts.port : 0;
        server.listen(wanted, '127.0.0.1', () => {
            currentPort = server.address().port;
            logFn('obs', 'LOG', [`Serveur OBS actif sur 127.0.0.1:${currentPort}`]);
            resolve({ port: currentPort, token });
        });
    });
}

/** Met à jour l'état diffusé aux clients (dock). Appelé par main.js. */
function updateStatus(partial) {
    lastStatus = Object.assign({}, lastStatus, partial || {});
    broadcast({ type: 'status', status: lastStatus });
}

/** Arrête proprement le serveur (à l'extinction de l'app). */
function stop() {
    for (const sock of wsClients) { try { sock.destroy(); } catch {} }
    wsClients.clear();
    if (server) { try { server.close(); } catch {} server = null; }
}

function getInfo() {
    return server ? { port: currentPort, token } : null;
}

module.exports = { start, stop, updateStatus, getInfo };
