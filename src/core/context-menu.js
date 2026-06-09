/**
 * DualView - Context Menu
 *
 * Construction et affichage du menu contextuel natif OS sur clic droit
 * dans les webviews paysage (v0.4.1).
 *
 * Appelé depuis did-attach-webview → wvContents.on('context-menu').
 * Les params Electron sont complets ici (linkURL, mediaType, selectionText…)
 * contrairement à l'événement 'context-menu' d'une <webview> côté renderer.
 *
 * Extrait de main.js v0.4.5 pour améliorer la maintenabilité open source.
 */

'use strict';

const { app, Menu, MenuItem, dialog, clipboard } = require('electron');
const path   = require('path');
const logger = require('./logger');

/**
 * Construit et affiche le menu contextuel natif en fonction du contexte du clic.
 *
 * @param {Electron.ContextMenuParams} params        Paramètres Electron du clic droit
 * @param {Electron.WebContents}       wvContents    WebContents de la webview ciblée
 * @param {object}                     opts
 * @param {Function}                   opts.getLandscapeWin        getter → BrowserWindow|null
 * @param {Function}                   opts.configGet              getter config (keyPath → value)
 * @param {Function}                   opts.setPendingImageSavePath setter du flag téléchargement image
 */
async function buildAndShowContextMenu(params, wvContents, { getLandscapeWin, configGet, setPendingImageSavePath }) {
    const landscapeWin = getLandscapeWin();
    if (!landscapeWin || landscapeWin.isDestroyed()) return;

    const menu  = new Menu();
    const isFr  = (configGet('settings.language') || 'fr') === 'fr';

    // ── Lien ──────────────────────────────────────────────────────────────────
    if (params.linkURL && params.linkURL.startsWith('http')) {
        menu.append(new MenuItem({
            label: isFr ? 'Ouvrir dans un nouvel onglet' : 'Open in new tab',
            click() {
                landscapeWin.webContents.send('context-menu-action', { action: 'open-link-new-tab', url: params.linkURL });
            },
        }));
        menu.append(new MenuItem({
            label: isFr ? "Copier l'adresse du lien" : 'Copy link address',
            click() { clipboard.writeText(params.linkURL); },
        }));
        menu.append(new MenuItem({ type: 'separator' }));
    }

    // ── Image ─────────────────────────────────────────────────────────────────
    if (params.mediaType === 'image' && params.srcURL) {
        menu.append(new MenuItem({
            label: isFr ? "Enregistrer l'image sous…" : 'Save image as…',
            async click() {
                let ext = 'png';
                try { ext = params.srcURL.split('?')[0].split('.').pop().toLowerCase() || 'png'; } catch { }
                if (!['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'].includes(ext)) ext = 'png';
                const defaultName = params.srcURL.split('/').pop().split('?')[0] || ('image.' + ext);
                const { canceled, filePath } = await dialog.showSaveDialog(landscapeWin, {
                    title:       isFr ? "Enregistrer l'image" : 'Save image',
                    defaultPath: path.join(app.getPath('pictures'), defaultName),
                    filters:     [{ name: 'Images', extensions: [ext, 'png', 'jpg', 'webp'] }],
                });
                if (canceled || !filePath) return;
                // Positionner le flag AVANT downloadURL : le handler will-download
                // global lira _pendingImageSavePath et laissera passer ce téléchargement.
                setPendingImageSavePath(filePath);
                wvContents.downloadURL(params.srcURL);
            },
        }));
        menu.append(new MenuItem({
            label: isFr ? "Copier l'adresse de l'image" : 'Copy image address',
            click() { clipboard.writeText(params.srcURL); },
        }));
        menu.append(new MenuItem({ type: 'separator' }));
    }

    // ── Texte sélectionné ─────────────────────────────────────────────────────
    if (params.selectionText && params.selectionText.trim()) {
        const sel        = params.selectionText.trim();
        const displaySel = sel.length > 20 ? sel.slice(0, 20) + '…' : sel;
        if (params.isEditable) {
            menu.append(new MenuItem({
                label: isFr ? 'Couper' : 'Cut',
                click() { wvContents.cut(); },
            }));
        }
        menu.append(new MenuItem({
            label: isFr ? 'Copier' : 'Copy',
            click() { wvContents.copy(); },
        }));
        if (params.isEditable) {
            menu.append(new MenuItem({
                label: isFr ? 'Coller' : 'Paste',
                click() { wvContents.paste(); },
            }));
        }
        menu.append(new MenuItem({
            label: isFr ? `Rechercher "${displaySel}"` : `Search "${displaySel}"`,
            click() {
                landscapeWin.webContents.send('context-menu-action', { action: 'search-selection', text: sel });
            },
        }));
        menu.append(new MenuItem({ type: 'separator' }));
    }

    // ── Champ de saisie sans sélection ───────────────────────────────────────
    if (params.isEditable && !(params.selectionText && params.selectionText.trim())) {
        menu.append(new MenuItem({
            label: isFr ? 'Coller' : 'Paste',
            click() { wvContents.paste(); },
        }));
        menu.append(new MenuItem({ type: 'separator' }));
    }

    // ── Page (toujours présent) ───────────────────────────────────────────────
    menu.append(new MenuItem({
        label: isFr ? 'Recharger' : 'Reload',
        click() { landscapeWin.webContents.send('context-menu-action', { action: 'reload' }); },
    }));
    menu.append(new MenuItem({
        label: isFr ? "Copier l'URL de la page" : 'Copy page URL',
        click() { landscapeWin.webContents.send('context-menu-action', { action: 'copy-page-url' }); },
    }));

    // Mode dev uniquement : Inspecter l'élément
    if (logger.IS_DEV) {
        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(new MenuItem({
            label: isFr ? 'Inspecter' : 'Inspect element',
            click() { wvContents.inspectElement(params.x, params.y); },
        }));
    }

    menu.popup({ window: landscapeWin });
}

module.exports = { buildAndShowContextMenu };