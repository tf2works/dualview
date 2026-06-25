/*
 * DualView - Injection CSS/JS par domaine (P4-J — v0.8.0)
 *
 * Permet d'injecter du CSS et/ou du JavaScript personnalisés dans les
 * webviews selon le domaine de la page visitée. Architecture inspirée
 * de Stylus pour le CSS, de Tampermonkey pour le JS.
 *
 * Règle : { id, label, domain, css, js, enabled }
 *   - domain  : domaine cible (ex. 'github.com') ou wildcard (ex. '*.google.com')
 *   - css     : feuille de style injectée via webview.insertCSS()
 *   - js      : script injecté via webview.executeJavaScript() dans un try/catch
 *   - enabled : booléen, désactiver sans supprimer
 *
 * API globale (utilisée par landscape-views.js et landscape-settings.js) :
 *   applyUserScripts(wv, url)        — injection au chargement d'une page
 *   renderUserScriptsList()          — rendu de la liste dans les Paramètres
 *
 * Persistance : currentSettings.userScripts (tableau), sauvegardé via
 * saveCurrentSettings() → window.dualview.saveSettings().
 *
 * Dépendances : landscape-i18n.js (t), landscape-ui.js (showToast)
 * Chargé après : landscape-i18n.js, landscape-ui.js
 * Chargé avant : landscape-views.js (qui appelle applyUserScripts)
 */

// ── Helpers domaine ────────────────────────────────────────────────────────────

/**
 * Extrait le hostname d'une URL, sans 'www.' (ex. 'github.com').
 * Retourne null si l'URL est invalide.
 */
function _injDomainFromUrl(url) {
    try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
}

/**
 * Vérifie si une règle s'applique à l'URL donnée.
 * Supporte les wildcards simples : '*.example.com' → tout sous-domaine et example.com.
 * Une règle désactivée (enabled === false) ne correspond jamais.
 */
function _injRuleMatches(rule, url) {
    if (!rule || rule.enabled === false) return false;
    const host = _injDomainFromUrl(url);
    if (!host) return false;
    const pattern = (rule.domain || '').toLowerCase().replace(/^www\./, '').trim();
    if (!pattern) return false;
    if (pattern.startsWith('*.')) {
        const base = pattern.slice(2);
        return host === base || host.endsWith('.' + base);
    }
    return host === pattern || host.endsWith('.' + pattern);
}

// ── Injection ──────────────────────────────────────────────────────────────────

/**
 * Applique les règles CSS/JS actives correspondant à l'URL dans la webview.
 * Appelé depuis landscape-views.js sur dom-ready et did-navigate.
 *
 * @param {Electron.WebviewTag} wv
 * @param {string}              url
 */
function applyUserScripts(wv, url) {
    if (!url || url === 'about:blank') return;
    const rules = (typeof currentSettings !== 'undefined' && Array.isArray(currentSettings.userScripts))
        ? currentSettings.userScripts : [];
    if (!rules.length) return;

    rules.forEach(rule => {
        if (!_injRuleMatches(rule, url)) return;
        if (rule.css && rule.css.trim()) {
            wv.insertCSS(rule.css).catch(() => { });
        }
        if (rule.js && rule.js.trim()) {
            // Envelopper dans un try/catch pour ne pas casser la page
            const wrapped = `(function(){\ntry{\n${rule.js}\n}catch(_dv_e){console.warn('[DualView injection "${(rule.label||'').replace(/"/g,"'")}"',_dv_e);}\n})();true;`;
            wv.executeJavaScript(wrapped).catch(() => { });
        }
    });
}

// ── Panel Paramètres — rendu & CRUD ───────────────────────────────────────────

/** État local du formulaire d'édition (null = fermé). */
let _injEditId = null;

/**
 * Retourne (et initialise si nécessaire) le tableau des règles depuis currentSettings.
 */
function _injGetRules() {
    if (!currentSettings.userScripts || !Array.isArray(currentSettings.userScripts))
        currentSettings.userScripts = [];
    return currentSettings.userScripts;
}

function _injSave() {
    if (typeof saveCurrentSettings === 'function') saveCurrentSettings();
}

/**
 * Génère un id unique pour une nouvelle règle.
 */
function _injNewId() {
    return 'us-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
}

/**
 * Échappe les caractères HTML dans une chaîne (pour innerHTML sécurisé).
 */
function _injEsc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/**
 * Rend la liste complète des règles dans #us-list.
 * Appelé par loadSettingsUI() et après chaque modification CRUD.
 */
function renderUserScriptsList() {
    const listEl = document.getElementById('us-list');
    if (!listEl) return;
    const rules = _injGetRules();
    listEl.innerHTML = '';

    if (rules.length === 0) {
        listEl.innerHTML = `<div class="us-empty" data-i18n="usEmpty">${t('usEmpty')}</div>`;
        return;
    }

    rules.forEach((rule, idx) => {
        const item = document.createElement('div');
        item.className = 'us-item' + (rule.enabled === false ? ' us-item-disabled' : '');
        item.dataset.id = rule.id;
        const hasCss = rule.css && rule.css.trim();
        const hasJs  = rule.js  && rule.js.trim();
        const badges = [
            hasCss ? '<span class="us-badge us-badge-css">CSS</span>' : '',
            hasJs  ? '<span class="us-badge us-badge-js">JS</span>'   : '',
        ].join('');
        item.innerHTML = `
<div class="us-item-left">
    <label class="us-toggle" title="${_injEsc(t('usToggle'))}">
        <input type="checkbox" class="us-enable-cb" ${rule.enabled !== false ? 'checked' : ''}>
        <span class="us-toggle-slider"></span>
    </label>
    <div class="us-item-info">
        <span class="us-item-label">${_injEsc(rule.label || t('usUnnamedRule'))}</span>
        <span class="us-item-domain">${_injEsc(rule.domain || '—')}</span>
    </div>
    <div class="us-badges">${badges}</div>
</div>
<div class="us-item-actions">
    <button class="us-edit-btn" data-id="${rule.id}">${t('usEdit')}</button>
    <button class="us-delete-btn" data-id="${rule.id}">✕</button>
</div>`;

        // Toggle enable/disable
        item.querySelector('.us-enable-cb').addEventListener('change', (e) => {
            rule.enabled = e.target.checked;
            _injSave();
            item.classList.toggle('us-item-disabled', !rule.enabled);
        });

        // Modifier
        item.querySelector('.us-edit-btn').addEventListener('click', () => {
            _injOpenForm(rule.id);
        });

        // Supprimer
        item.querySelector('.us-delete-btn').addEventListener('click', () => {
            if (!confirm(t('usDeleteConfirm'))) return;
            currentSettings.userScripts.splice(idx, 1);
            _injSave();
            renderUserScriptsList();
        });

        listEl.appendChild(item);
    });
}

/**
 * Ouvre le formulaire d'édition pour la règle donnée, ou en création si id === null.
 */
function _injOpenForm(ruleId) {
    const formEl = document.getElementById('us-form');
    if (!formEl) return;
    _injEditId = ruleId || null;

    let rule = null;
    if (ruleId) {
        rule = _injGetRules().find(r => r.id === ruleId) || null;
    }

    document.getElementById('us-form-title').textContent = rule ? t('usEditRule') : t('usNewRule');
    document.getElementById('us-form-label').value  = rule ? (rule.label  || '') : '';
    document.getElementById('us-form-domain').value = rule ? (rule.domain || '') : '';
    document.getElementById('us-form-css').value    = rule ? (rule.css    || '') : '';
    document.getElementById('us-form-js').value     = rule ? (rule.js     || '') : '';
    document.getElementById('us-form-msg').className = 's-msg';
    formEl.classList.remove('hidden');
    document.getElementById('us-form-label').focus();
}

function _injCloseForm() {
    const formEl = document.getElementById('us-form');
    if (formEl) formEl.classList.add('hidden');
    _injEditId = null;
}

// ── Listeners du formulaire ────────────────────────────────────────────────────

(function _setupInjectionListeners() {
    // Attacher après le DOM ready (le script est chargé en bas de landscape.html)
    const addBtn = document.getElementById('us-add-btn');
    if (addBtn) addBtn.addEventListener('click', () => _injOpenForm(null));

    const cancelBtn = document.getElementById('us-form-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', _injCloseForm);

    const saveBtn = document.getElementById('us-form-save');
    if (saveBtn) saveBtn.addEventListener('click', () => {
        const label  = (document.getElementById('us-form-label').value  || '').trim();
        const domain = (document.getElementById('us-form-domain').value || '').trim();
        const css    = (document.getElementById('us-form-css').value    || '').trim();
        const js     = (document.getElementById('us-form-js').value     || '').trim();
        const msg    = document.getElementById('us-form-msg');

        // Validation minimale
        if (!domain) {
            msg.textContent = t('usDomainRequired');
            msg.className = 's-msg show err';
            return;
        }
        if (!css && !js) {
            msg.textContent = t('usCssOrJsRequired');
            msg.className = 's-msg show err';
            return;
        }

        const rules = _injGetRules();
        if (_injEditId) {
            // Mise à jour d'une règle existante
            const existing = rules.find(r => r.id === _injEditId);
            if (existing) {
                existing.label  = label;
                existing.domain = domain;
                existing.css    = css;
                existing.js     = js;
            }
        } else {
            // Nouvelle règle
            rules.push({ id: _injNewId(), label, domain, css, js, enabled: true });
        }
        _injSave();
        _injCloseForm();
        renderUserScriptsList();
        if (typeof showToast === 'function') showToast(t('usSaved'));
    });
})();