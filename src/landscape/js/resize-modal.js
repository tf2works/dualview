/**
 * DualView - Landscape Resize Modal
 * Version: 0.4.2
 *
 * Modale de redimensionnement de la fenêtre portrait (v0.4.0) :
 *   startResizeMode, modale presets, Valider/Annuler
 */

'use strict';

const resizeModalOverlay = document.getElementById('resize-modal-overlay');
const resizePresetList   = document.getElementById('resize-preset-list');
let currentPresetId = null;

async function startResizeMode() {
    const presets    = await window.dualview.getPortraitPresets();
    const savedPreset = currentSettings.portraitPreset || 'iphone15';
    currentPresetId = savedPreset;

    resizePresetList.innerHTML = '';
    presets.forEach(preset => {
        const item = document.createElement('div');
        item.className = 'resize-preset-item' + (preset.id === savedPreset ? ' active' : '');
        item.dataset.id = preset.id;
        item.innerHTML = `<span>📱 ${preset.label}</span><span class="resize-preset-dim">${preset.width} × ${preset.height} px</span>`;
        item.addEventListener('click', () => {
            resizePresetList.querySelectorAll('.resize-preset-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            currentPresetId = preset.id;
            window.dualview.applyPortraitPreset(preset.id);
        });
        resizePresetList.appendChild(item);
    });

    const freeItem = document.createElement('div');
    freeItem.className = 'resize-preset-item free-size';
    freeItem.innerHTML = `<span>↔ Taille libre</span><span class="resize-preset-dim">redimensionnez la fenêtre Portrait</span>`;
    freeItem.addEventListener('click', () => {
        resizePresetList.querySelectorAll('.resize-preset-item').forEach(el => el.classList.remove('active'));
        freeItem.classList.add('active');
        currentPresetId = null;
    });
    resizePresetList.appendChild(freeItem);

    resizeModalOverlay.classList.add('show');
    window.dualview.startPortraitResize();
}

document.getElementById('resize-modal-validate').addEventListener('click', () => {
    resizeModalOverlay.classList.remove('show');
    if (currentPresetId) {
        currentSettings.portraitPreset = currentPresetId;
        saveCurrentSettings();
    }
    window.dualview.finishPortraitResize();
});

document.getElementById('resize-modal-cancel').addEventListener('click', () => {
    resizeModalOverlay.classList.remove('show');
    window.dualview.cancelPortraitResize();
});
