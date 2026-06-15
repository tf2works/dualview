/**
 * DualView - Context Menu
 * Version: 0.5.4
 *
 * Construction et affichage du menu contextuel natif OS sur clic droit
 * dans les webviews paysage.
 *
 * Appelé depuis did-attach-webview → wvContents.on('context-menu').
 * Les params Electron sont complets ici (linkURL, mediaType, selectionText…)
 * contrairement à l'événement 'context-menu' d'une <webview> côté renderer.
 *
 * Historique :
 *   v0.4.1 — création (extrait de main.js v0.4.5)
 *   v0.5.3 — mailto, ouvrir navigateur système, copier image, ouvrir image onglet,
 *             sélectionner tout, annuler, rétablir
 *   v0.5.4 — retour/avance (TAB_TYPE_WEB uniquement), imprimer via printToPDF+shell.openExternal,
 *             code source (TAB_TYPE_WEB), inspecter élément (tous onglets, sans guard IS_DEV)
 *   v0.5.4b — fix canGoBack/Forward deprecated → navigationHistory API
 *              fix impression → printToPDF + fichier temp + shell.openExternal (aperçu OS complet)
 *              suppression @cliqz/adblocker-electron (dépendance inutilisée → logs parasites)
 */

'use strict';

const { app, Menu, MenuItem, dialog, clipboard, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

/**
 * Construit et affiche le menu contextuel natif en fonction du contexte du clic.
 *
 * @param {Electron.ContextMenuParams} params           Paramètres Electron du clic droit
 * @param {Electron.WebContents}       wvContents       WebContents de la webview ciblée
 * @param {object}                     opts
 * @param {Function}                   opts.getLandscapeWin         getter → BrowserWindow|null
 * @param {Function}                   opts.configGet               getter config (keyPath → value)
 * @param {Function}                   opts.setPendingImageSavePath setter du flag téléchargement image
 * @param {string}                     opts.activeTabType           type de l'onglet actif (TAB_TYPE_*)
 */
async function buildAndShowContextMenu(params, wvContents, { getLandscapeWin, configGet, setPendingImageSavePath, activeTabType }) {
    const landscapeWin = getLandscapeWin();
    if (!landscapeWin || landscapeWin.isDestroyed()) return;

    const menu    = new Menu();
    const isFr    = (configGet('settings.language') || 'fr') === 'fr';
    const isWeb   = activeTabType === 'web';

    // ── Lien mailto (v0.5.3) ─────────────────────────────────────────────────
    if (params.linkURL && params.linkURL.startsWith('mailto:')) {
        const email = params.linkURL.replace(/^mailto:/i, '').split('?')[0].trim();
        if (email) {
            menu.append(new MenuItem({
                label: isFr ? "Copier l'adresse email" : 'Copy email address',
                click() { clipboard.writeText(email); },
            }));
            menu.append(new MenuItem({ type: 'separator' }));
        }
    }

    // ── Lien http/https ───────────────────────────────────────────────────────
    if (params.linkURL && params.linkURL.startsWith('http')) {
        menu.append(new MenuItem({
            label: isFr ? 'Ouvrir dans un nouvel onglet' : 'Open in new tab',
            click() {
                landscapeWin.webContents.send('context-menu-action', { action: 'open-link-new-tab', url: params.linkURL });
            },
        }));
        // v0.5.3 — Ouvrir dans le navigateur système
        menu.append(new MenuItem({
            label: isFr ? 'Ouvrir dans le navigateur système' : 'Open in system browser',
            click() { shell.openExternal(params.linkURL); },
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
                setPendingImageSavePath(filePath);
                wvContents.downloadURL(params.srcURL);
            },
        }));
        // v0.5.3 — Copier l'image dans le presse-papiers
        menu.append(new MenuItem({
            label: isFr ? "Copier l'image" : 'Copy image',
            click() { wvContents.copyImageAt(params.x, params.y); },
        }));
        // v0.5.3 — Ouvrir l'image dans un nouvel onglet
        menu.append(new MenuItem({
            label: isFr ? "Ouvrir l'image dans un nouvel onglet" : 'Open image in new tab',
            click() {
                landscapeWin.webContents.send('context-menu-action', { action: 'open-link-new-tab', url: params.srcURL });
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

    // ── Champ éditable sans sélection (v0.5.3) ───────────────────────────────
    if (params.isEditable && !(params.selectionText && params.selectionText.trim())) {
        menu.append(new MenuItem({
            label: isFr ? 'Annuler' : 'Undo',
            click() { wvContents.undo(); },
        }));
        menu.append(new MenuItem({
            label: isFr ? 'Rétablir' : 'Redo',
            click() { wvContents.redo(); },
        }));
        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(new MenuItem({
            label: isFr ? 'Coller' : 'Paste',
            click() { wvContents.paste(); },
        }));
        menu.append(new MenuItem({
            label: isFr ? 'Sélectionner tout' : 'Select all',
            click() { wvContents.selectAll(); },
        }));
        menu.append(new MenuItem({ type: 'separator' }));
    }

    // ── Page ─────────────────────────────────────────────────────────────────
    menu.append(new MenuItem({
        label: isFr ? 'Recharger' : 'Reload',
        click() { landscapeWin.webContents.send('context-menu-action', { action: 'reload' }); },
    }));
    menu.append(new MenuItem({
        label: isFr ? "Copier l'URL de la page" : 'Copy page URL',
        click() { landscapeWin.webContents.send('context-menu-action', { action: 'copy-page-url' }); },
    }));

    // ── Navigation (v0.5.4 — TAB_TYPE_WEB uniquement) ────────────────────────
    if (isWeb) {
        // v0.5.4 fix : navigationHistory.canGoBack/Forward remplace l'API dépréciée
        let canBack    = false;
        let canForward = false;
        try {
            const nh = wvContents.navigationHistory;
            canBack    = nh ? nh.canGoBack()    : false;
            canForward = nh ? nh.canGoForward() : false;
        } catch { }

        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(new MenuItem({
            label:   isFr ? 'Retour' : 'Back',
            enabled: canBack,
            click() { landscapeWin.webContents.send('context-menu-action', { action: 'nav-back' }); },
        }));
        menu.append(new MenuItem({
            label:   isFr ? 'Avance' : 'Forward',
            enabled: canForward,
            click() { landscapeWin.webContents.send('context-menu-action', { action: 'nav-forward' }); },
        }));
    }

    // ── Imprimer (v0.5.4 — TAB_TYPE_WEB uniquement) ──────────────────────────
    // printToPDF → fichier temp → shell.openExternal (aperçu OS natif + impression complète)
    if (isWeb) {
        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(new MenuItem({
            label: isFr ? 'Imprimer…' : 'Print…',
            async click() {
                try {
                    const pdfData = await wvContents.printToPDF({
                        printBackground:  true,
                        pageSize:         'A4',
                        landscape:        false,
                        marginsType:      0,   // marges par défaut
                        generateTaggedPDF: false,
                    });
                    // Fichier temporaire dans le dossier temp OS
                    const tmpPath = path.join(os.tmpdir(), `dualview-print-${Date.now()}.pdf`);
                    fs.writeFileSync(tmpPath, pdfData);
                    // Ouvrir dans le lecteur PDF système (aperçu natif + Enregistrer sous)
                    await shell.openExternal(`file://${tmpPath}`);
                    // Nettoyage différé (30 s) — le lecteur PDF a le temps de charger le fichier
                    setTimeout(() => { try { fs.unlinkSync(tmpPath); } catch { } }, 30000);
                } catch (e) {
                    // Afficher une dialog d'erreur si printToPDF échoue (ex. page non chargée)
                    dialog.showErrorBox(
                        isFr ? 'Erreur d\'impression' : 'Print error',
                        isFr ? `Impossible de générer le PDF.\n${e.message}` : `Could not generate PDF.\n${e.message}`
                    );
                }
            },
        }));
    }

    // ── Code source (v0.5.4 — TAB_TYPE_WEB uniquement) ───────────────────────
    if (isWeb) {
        menu.append(new MenuItem({
            label: isFr ? 'Afficher le code source' : 'View page source',
            click() {
                landscapeWin.webContents.send('context-menu-action', { action: 'view-source' });
            },
        }));
    }

    // ── Inspecter l'élément (v0.5.4 — tous onglets, sans guard IS_DEV) ───────
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({
        label: isFr ? 'Inspecter l\'élément' : 'Inspect element',
        click() { wvContents.inspectElement(params.x, params.y); },
    }));

    menu.popup({ window: landscapeWin });
}

module.exports = { buildAndShowContextMenu };