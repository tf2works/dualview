/**
 * DualView - Context Menu
 * Version: 0.4.2
 *
 * Responsabilité unique : construction et affichage du menu contextuel natif
 * OS sur clic droit dans les webviews (paysage).
 *
 * Le menu est construit avec les vrais params Electron (linkURL, mediaType,
 * selectionText…) disponibles uniquement dans did-attach-webview → context-menu,
 * pas côté renderer.
 *
 * Sections du menu :
 *   - Lien (ouvrir en onglet, copier URL)
 *   - Image (enregistrer, copier URL)
 *   - Texte sélectionné (couper/copier/coller/rechercher)
 *   - Champ de saisie sans sélection (coller)
 *   - Page (recharger, copier URL)
 *   - Dev only (Inspecter l'élément)
 */

'use strict';

const { Menu, MenuItem, clipboard } = require('electron');
const logger = require('../logger');

// ── Builders ──────────────────────────────────────────────────────────────────

/**
 * Construit et affiche le menu contextuel natif.
 *
 * @param {Electron.ContextMenuParams} params   Params fournis par 'context-menu'
 * @param {Electron.WebContents}       wvContents  WebContents de la webview
 * @param {BrowserWindow}              landscapeWin Fenêtre parente (pour popup + IPC)
 * @param {object}                     opts
 * @param {string}                     opts.language   'fr' | 'en'
 * @param {string}                     opts.searchEngineUrl  URL du moteur (avec %s ou trailing ?)
 * @param {Function}                   opts.getPendingImageSavePath  getter
 * @param {Function}                   opts.setPendingImageSavePath  setter
 */
function buildAndShowContextMenu(params, wvContents, landscapeWin, {
    language = 'fr',
    searchEngineUrl = 'https://duckduckgo.com/?q=',
    getPendingImageSavePath,
    setPendingImageSavePath,
} = {}) {
    const isFr  = language !== 'en';
    const menu  = new Menu();

    // ── Lien ─────────────────────────────────────────────────────────────────
    if (params.linkURL) {
        menu.append(new MenuItem({
            label: isFr ? 'Ouvrir dans un nouvel onglet' : 'Open in new tab',
            click() {
                landscapeWin.webContents.send('context-menu-action', {
                    action: 'open-link-new-tab',
                    url: params.linkURL,
                });
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
                const { dialog, app } = require('electron');
                const path = require('path');
                const filename = path.basename(new URL(params.srcURL).pathname) || 'image.png';
                const { canceled, filePath } = await dialog.showSaveDialog(landscapeWin, {
                    title:       isFr ? "Enregistrer l'image" : 'Save image',
                    defaultPath: path.join(app.getPath('pictures'), filename),
                    filters:     [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
                });
                if (!canceled && filePath) {
                    // Positionner le flag AVANT downloadURL pour que will-download
                    // laisse passer ce seul téléchargement.
                    if (typeof setPendingImageSavePath === 'function') setPendingImageSavePath(filePath);
                    wvContents.downloadURL(params.srcURL);
                }
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
                landscapeWin.webContents.send('context-menu-action', {
                    action: 'search-selection',
                    text: sel,
                });
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
        click() {
            landscapeWin.webContents.send('context-menu-action', { action: 'reload' });
        },
    }));
    menu.append(new MenuItem({
        label: isFr ? "Copier l'URL de la page" : 'Copy page URL',
        click() {
            landscapeWin.webContents.send('context-menu-action', { action: 'copy-page-url' });
        },
    }));

    // ── Dev uniquement : Inspecter ────────────────────────────────────────────
    if (logger.IS_DEV) {
        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(new MenuItem({
            label: isFr ? 'Inspecter' : 'Inspect element',
            click() { wvContents.inspectElement(params.x, params.y); },
        }));
    }

    menu.popup({ window: landscapeWin });
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = { buildAndShowContextMenu };
