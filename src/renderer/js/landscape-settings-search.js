/*
 * DualView - Recherche dans les paramètres
 * Version: 0.9.1
 *
 * Barre de recherche unique, affichée en permanence en haut de .s-content
 * (donc visible quelle que soit la section active). Recherche GLOBALE :
 * l'index couvre les 7 sections, un résultat redirige vers la bonne section
 * puis surligne temporairement la ligne trouvée.
 *
 * - Index construit paresseusement à partir du DOM déjà traduit (aucun
 *   dictionnaire séparé à maintenir : fonctionne en FR/EN automatiquement,
 *   car currentLang ne peut de toute façon changer qu'après un redémarrage
 *   complet de la fenêtre paysage — cf. settings → Général → Langue).
 * - Portée v0.9.1 : libellés STATIQUES uniquement (.s-heading, .s-label,
 *   .s-check-label, .s-info-title, .sc-card-title, .sc-action + leur
 *   description associée). Les entrées 100% dynamiques (tuiles Services
 *   connectés, checklist Export/Import, règles Scripts & Styles) ne sont
 *   pas encore indexées — à ajouter dans une itération suivante si besoin.
 * - Matching : mots-clés normalisés (minuscules, accents retirés) +
 *   tolérance aux fautes de frappe via distance de Levenshtein par mot.
 *
 * Dépendances : landscape-settings.js doit être chargé AVANT ce fichier
 * (les listeners .s-nav doivent déjà être posés, on les réutilise via
 * nav.click() pour ne pas dupliquer loadServicesStatus/loadObsInfo/
 * buildExportChecklist/renderUserScriptsList et créer une régression).
 * landscape-i18n.js doit aussi être chargé avant (fonction t()).
 */

const SETTINGS_SEARCH_ANCHOR_SELECTOR =
    '.s-heading, .s-label, .s-check-label, .s-info-title, .sc-card-title, .sc-action';
const SETTINGS_SEARCH_ROW_SELECTOR =
    '.s-row, .s-info-block, .sc-row, .sc-card';
const SETTINGS_SEARCH_MAX_RESULTS = 25;

let settingsSearchIndex = null;      // construit à la 1ère recherche (lazy)
let settingsSearchResults = [];      // résultats affichés actuellement
let settingsSearchSelectedIdx = -1;  // sélection clavier (↑ ↓)

// ── Normalisation / distance ────────────────────────────────────────────────
function normalizeSearchText(str) {
    return (str || '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function levenshtein(a, b) {
    if (a === b) return 0;
    const al = a.length, bl = b.length;
    if (al === 0) return bl;
    if (bl === 0) return al;
    let prev = new Array(bl + 1);
    let curr = new Array(bl + 1);
    for (let j = 0; j <= bl; j++) prev[j] = j;
    for (let i = 1; i <= al; i++) {
        curr[0] = i;
        for (let j = 1; j <= bl; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(
                prev[j] + 1,       // suppression
                curr[j - 1] + 1,   // insertion
                prev[j - 1] + cost // substitution
            );
        }
        const tmp = prev; prev = curr; curr = tmp;
    }
    return prev[bl];
}

// Tolérance selon la longueur du mot : les mots très courts n'acceptent
// que la correspondance exacte (sinon trop de faux positifs).
function fuzzyThreshold(len) {
    if (len <= 3) return 0;
    if (len <= 6) return 1;
    return 2;
}

/**
 * Score d'un mot recherché contre le texte normalisé d'une entrée.
 * 0 = aucune correspondance, même approximative.
 */
function settingsSearchTokenScore(token, normalizedText, textWords) {
    if (!token) return 0;
    if (normalizedText.includes(token)) {
        return textWords.includes(token) ? 3 : 2; // bonus mot entier vs sous-chaîne
    }
    const threshold = fuzzyThreshold(token.length);
    if (threshold === 0) return 0;
    let best = Infinity;
    for (const w of textWords) {
        if (Math.abs(w.length - token.length) > threshold) continue; // évite les comparaisons inutiles
        const d = levenshtein(token, w);
        if (d < best) best = d;
        if (best === 0) break;
    }
    return best <= threshold ? 1 / (best + 1) : 0;
}

// ── Construction de l'index ──────────────────────────────────────────────────
function buildSettingsSearchIndex() {
    const entries = [];
    const seenTargets = new Set();
    document.querySelectorAll(SETTINGS_SEARCH_ANCHOR_SELECTOR).forEach(anchor => {
        const section = anchor.closest('.s-section');
        if (!section) return;
        const target = anchor.closest(SETTINGS_SEARCH_ROW_SELECTOR) || anchor;
        if (seenTargets.has(target)) return;
        seenTargets.add(target);

        let text = target.textContent || '';
        // Libellés "orphelins" sans conteneur .s-row (ex. titres Exporter/
        // Importer dans Export/Import) : on récupère aussi la description
        // juste après, si elle existe.
        if (target === anchor) {
            const next = anchor.nextElementSibling;
            if (next && next.classList.contains('s-desc')) {
                text += ' ' + next.textContent;
            }
        }

        const normalized = normalizeSearchText(text);
        if (!normalized) return;
        entries.push({
            sectionId: section.id.replace('section-', ''),
            label: anchor.textContent.trim(),
            target,
            normalized,
            words: normalized.split(' ').filter(Boolean),
        });
    });
    return entries;
}

function getSettingsSectionLabel(sectionId) {
    const span = document.querySelector('.s-nav[data-section="' + sectionId + '"] span:last-child');
    return span ? span.textContent.trim() : sectionId;
}

// ── Recherche ────────────────────────────────────────────────────────────────
function runSettingsSearch(rawQuery) {
    const query = normalizeSearchText(rawQuery);
    if (!query) return [];
    const tokens = query.split(' ').filter(Boolean);
    if (!settingsSearchIndex) settingsSearchIndex = buildSettingsSearchIndex();

    const scored = [];
    for (const entry of settingsSearchIndex) {
        let total = 0;
        let matchesAll = true;
        for (const token of tokens) {
            const s = settingsSearchTokenScore(token, entry.normalized, entry.words);
            if (s === 0) { matchesAll = false; break; }
            total += s;
        }
        if (!matchesAll) continue;
        if (entry.normalized.includes(query)) total += 2; // bonus phrase complète
        scored.push({ entry, score: total });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, SETTINGS_SEARCH_MAX_RESULTS).map(s => s.entry);
}

// ── Rendu des résultats ────────────────────────────────────────────────────
function renderSettingsSearchResults(results) {
    const box = document.getElementById('s-search-results');
    if (!box) return;
    box.innerHTML = '';
    settingsSearchResults = results;
    settingsSearchSelectedIdx = -1;

    if (!results.length) {
        const empty = document.createElement('div');
        empty.className = 'ssr-empty';
        empty.textContent = t('settingsSearchNoResults');
        box.appendChild(empty);
        box.classList.add('open');
        return;
    }

    let lastSection = null;
    results.forEach((entry, idx) => {
        if (entry.sectionId !== lastSection) {
            const lbl = document.createElement('div');
            lbl.className = 'ssr-section-lbl';
            lbl.textContent = getSettingsSectionLabel(entry.sectionId);
            box.appendChild(lbl);
            lastSection = entry.sectionId;
        }
        const item = document.createElement('div');
        item.className = 'ssr-item';
        item.dataset.idx = String(idx);
        item.textContent = entry.label;
        item.addEventListener('click', () => selectSettingsSearchResult(idx));
        box.appendChild(item);
    });
    box.classList.add('open');
}

function updateSettingsSearchSelection() {
    const box = document.getElementById('s-search-results');
    if (!box) return;
    box.querySelectorAll('.ssr-item').forEach(el => {
        el.classList.toggle('selected', Number(el.dataset.idx) === settingsSearchSelectedIdx);
    });
    const sel = box.querySelector('.ssr-item.selected');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
}

function closeSettingsSearchResults() {
    const box = document.getElementById('s-search-results');
    if (box) { box.classList.remove('open'); box.innerHTML = ''; }
    settingsSearchResults = [];
    settingsSearchSelectedIdx = -1;
}

// ── Sélection d'un résultat : redirection + surlignage ──────────────────────
function highlightSettingsRow(el) {
    el.classList.remove('ssr-highlight-pulse');
    void el.offsetWidth; // force le reflow pour pouvoir rejouer l'animation sur le même élément
    el.classList.add('ssr-highlight-pulse');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => el.classList.remove('ssr-highlight-pulse'), 1500);
}

function selectSettingsSearchResult(idx) {
    const entry = settingsSearchResults[idx];
    if (!entry) return;
    const nav = document.querySelector('.s-nav[data-section="' + entry.sectionId + '"]');
    // Réutilise le listener existant (déclenche loadServicesStatus/loadObsInfo/
    // buildExportChecklist/renderUserScriptsList si besoin) plutôt que de
    // basculer les classes .active à la main — évite toute régression sur
    // ces 4 sections.
    if (nav && !nav.classList.contains('active')) nav.click();
    closeSettingsSearchResults();
    highlightSettingsRow(entry.target);
}

// ── Câblage ──────────────────────────────────────────────────────────────────
(function initSettingsSearch() {
    const input = document.getElementById('s-search-input');
    const clearBtn = document.getElementById('s-search-clear');
    if (!input || !clearBtn) return;

    clearBtn.title = t('settingsSearchClear');
    clearBtn.setAttribute('aria-label', t('settingsSearchClear'));

    input.addEventListener('input', () => {
        clearBtn.classList.toggle('hidden', !input.value);
        renderSettingsSearchResults(runSettingsSearch(input.value));
    });

    input.addEventListener('focus', () => {
        if (input.value && settingsSearchResults.length) {
            document.getElementById('s-search-results')?.classList.add('open');
        }
    });

    input.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            input.value = '';
            clearBtn.classList.add('hidden');
            closeSettingsSearchResults();
            input.blur();
            return;
        }
        if (!settingsSearchResults.length) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            settingsSearchSelectedIdx = Math.min(settingsSearchSelectedIdx + 1, settingsSearchResults.length - 1);
            updateSettingsSearchSelection();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            settingsSearchSelectedIdx = Math.max(settingsSearchSelectedIdx - 1, 0);
            updateSettingsSearchSelection();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            selectSettingsSearchResult(settingsSearchSelectedIdx >= 0 ? settingsSearchSelectedIdx : 0);
        }
    });

    clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.classList.add('hidden');
        closeSettingsSearchResults();
        input.focus();
    });

    // Clic en dehors du champ/de la liste : referme les résultats.
    document.addEventListener('click', e => {
        const wrap = document.getElementById('s-search-wrap');
        if (wrap && !wrap.contains(e.target)) closeSettingsSearchResults();
    });
})();