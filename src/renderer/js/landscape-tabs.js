/*
 * DualView - Onglets, navigation et omnibar
 * Version: 0.6.1
 *
 * Gestion des onglets (créer, fermer, switcher, persister),
 * commandes OBS, résolution d'URL, barre d'adresse, omnibar
 * (suggestions historique + moteur de recherche), screenshot.
 *
 * v0.6.1 — Corrections :
 *   • Drag & Drop : zone de repli sur #tab-bar — dropper un onglet hors
 *     d'un onglet/label de groupe le retire désormais de son groupe
 *     (auparavant sans effet en dehors d'un drop direct sur une cible).
 *   • Favicons : fetch HTTP déporté dans le main process (voir main.js),
 *     le renderer n'assigne plus jamais d'URL distante non vérifiée à
 *     <img src> → plus d'erreurs "Failed to load resource" en console.
 *
 * v0.6.0 — Nouvelles fonctionnalités onglets :
 *   • Rouvrir l'onglet fermé (historique illimité, Ctrl+Shift+T, menu contextuel onglet)
 *   • Groupes d'onglets : création, renommage, collapse, drag in/out, persistance
 *   • Onglets épinglés : groupe virtuel spécial, max 5, non restaurés entre sessions
 *   • Favicons sur tous les onglets (16×16, fallback favicon-default.svg)
 *   • Menu contextuel natif OS sur clic droit onglet (IPC tab-context-menu)
 *
 * v0.5.3 — Typage des onglets (TAB_TYPE_*) + Drag & Drop avec ligne indicatrice.
 *
 * Dépendances : landscape-i18n.js, landscape-ui.js, landscape-views.js,
 *               landscape-groups.js (v0.6.0)
 */

// ── Types d'onglets (v0.5.3) ──────────────────────────────────────────────────
const TAB_TYPE_WEB      = 'web';
const TAB_TYPE_SETTINGS = 'settings';
const TAB_TYPE_BLANK    = 'blank';

function getTabType(tab) {
    if (!tab) return TAB_TYPE_WEB;
    if (tab.type) return tab.type;
    if (tab.id === SETTINGS_TAB_ID) return TAB_TYPE_SETTINGS;
    if (!tab.url || tab.url === '') return TAB_TYPE_BLANK;
    return TAB_TYPE_WEB;
}
function isSettingsTab(tab) { return getTabType(tab) === TAB_TYPE_SETTINGS; }
function isWebTab(tab)      { return getTabType(tab) === TAB_TYPE_WEB; }

// ── Historique des onglets fermés (v0.6.0) ───────────────────────────────────
// Illimité en mémoire. Chaque entrée : { id, title, url, type, groupId, color }
const _closedTabsStack = [];

function _pushClosedTab(tab) {
    // Ne pas mémoriser l'onglet paramètres
    if (isSettingsTab(tab)) return;
    const groupId = groupIdOf(tab.id);
    _closedTabsStack.push({
        id:      'tab-' + Date.now() + '-' + Math.random().toString(36).slice(2),
        title:   tab.title || '',
        url:     tab.url   || '',
        type:    tab.type  || TAB_TYPE_WEB,
        groupId: groupId || null,
        color:   groupId ? groupColorOf(groupId) : null,
    });
}

function reopenLastClosedTab() {
    if (!_closedTabsStack.length) return;
    const closed = _closedTabsStack.pop();
    const id     = 'tab-' + Date.now();
    tabs.push({ id, title: closed.title, url: closed.url, type: closed.type });
    switchTab(id);
}

// ── Drag & Drop — état interne (v0.5.3 / v0.6.0 étendu) ─────────────────────
let _dragSrcId      = null;
let _dragIndicator  = null;
let _dragOverGroup  = null;   // v0.6.0 : groupId survolé pendant le drag

// ── Favicon (v0.6.0, fetch déporté vers le process principal en v0.6.1) ───────
// Stratégie en cascade, comme un navigateur classique :
//   1. Balises <link rel="icon"|"shortcut icon"|"apple-touch-icon"|...> de la page
//      (extraites via executeJavaScript dans la webview au dom-ready)
//   2. Repli sur <origin>/favicon.ico (deviné, sans garantie d'existence)
//   3. Repli final sur le SVG générique assets/favicon-default.svg
//
// v0.6.1 : la récupération HTTP réelle des étapes 1 et 2 ci-dessus se fait
// désormais dans le process principal (window.dualview.fetchFavicon, voir
// main.js). Le renderer n'assigne plus JAMAIS une URL distante non vérifiée
// à <img src> : uniquement une data: URL déjà validée par le main process,
// ou le SVG de repli local. Un favicon.ico / icon.ico / logo.ico introuvable
// ne déclenche donc plus d'erreur "Failed to load resource" dans la console
// DevTools de cette fenêtre — la requête HTTP qui échoue a lieu côté main
// process, dont la console n'est jamais visible depuis les DevTools du
// renderer.
//
// tabId → 'data:...' (icône valide) | null (résolu, aucune icône trouvée)
// Un tabId absent du Map = pas encore résolu.
const _faviconCache = new Map();
// tabId → URL candidate actuellement en cours de résolution. Permet à une
// résolution plus fiable (balise <link> déclarée par la page) de superséder
// une résolution moins fiable encore en vol (repli /favicon.ico deviné),
// au lieu d'être bloquée par elle : voir _resolveFavicon().
const _faviconPending = new Map();
// landscape.html est dans src/renderer/ ; favicon-default.svg est dans assets/
// à la racine du projet → deux niveaux au-dessus de renderer/.
const FAVICON_FALLBACK = '../../assets/favicon-default.svg';

// Script injecté dans la webview pour lister les icônes déclarées par la page.
// Cherche dans l'ordre de préférence usuel des navigateurs ; résout chaque
// href en URL absolue via location.href pour gérer les chemins relatifs.
const _FAVICON_EXTRACT_SCRIPT = `
(function() {
    try {
        const selectors = [
            'link[rel="icon"]',
            'link[rel="shortcut icon"]',
            'link[rel~="icon"]',
            'link[rel="apple-touch-icon"]',
            'link[rel="apple-touch-icon-precomposed"]',
            'link[rel="mask-icon"]',
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.href) return el.href;
        }
        return null;
    } catch (_) { return null; }
})();
`;

/**
 * Devine une URL de favicon par défaut (<origin>/favicon.ico) quand la page
 * ne déclare aucune balise <link rel="icon">. Simple candidat textuel —
 * n'est jamais assigné directement à <img src> : doit passer par
 * _resolveFavicon() qui le fait vérifier par le main process.
 */
function _guessFaviconUrl(tab) {
    if (!tab.url || tab.url === 'about:blank') return null;
    try {
        const origin = new URL(tab.url).origin;
        return origin + '/favicon.ico';
    } catch { return null; }
}

/**
 * Résout un favicon de façon sûre : délègue la requête HTTP au process
 * principal (window.dualview.fetchFavicon), qui renvoie soit une data: URL
 * (icône valide, déjà téléchargée et encodée) soit null (échec — jamais
 * loggé dans la console de cette fenêtre). Met à jour le cache et déclenche
 * un nouveau rendu si le résultat diffère de ce qui est déjà affiché.
 *
 * Anti-doublon sensible au candidat : un appel avec exactement le même
 * candidat qu'une résolution déjà en vol est ignoré. Un appel avec un
 * candidat DIFFÉRENT (typiquement : l'icône réelle déclarée par la page,
 * arrivant après que le repli /favicon.ico deviné a déjà été lancé) prend
 * le relais immédiatement ; le résultat de l'ancienne requête, à son retour,
 * est alors silencieusement ignoré (obsolète) plutôt que d'écraser le
 * résultat plus fiable.
 */
function _resolveFavicon(tabId, candidateUrl) {
    if (!candidateUrl) { if (!_faviconCache.has(tabId)) _faviconCache.set(tabId, null); return; }
    if (_faviconPending.get(tabId) === candidateUrl) return; // déjà en vol pour ce même candidat
    _faviconPending.set(tabId, candidateUrl);
    window.dualview.fetchFavicon(candidateUrl)
        .then(dataUrl => {
            if (_faviconPending.get(tabId) !== candidateUrl) return; // supersédé : résultat obsolète
            if (!tabs.some(t => t.id === tabId)) return; // onglet fermé entre-temps
            const previous = _faviconCache.get(tabId);
            _faviconCache.set(tabId, dataUrl || null);
            _faviconPending.delete(tabId);
            if (dataUrl && dataUrl !== previous) renderTabs();
        })
        .catch(() => {
            if (_faviconPending.get(tabId) !== candidateUrl) return; // supersédé
            if (!_faviconCache.has(tabId)) _faviconCache.set(tabId, null);
            _faviconPending.delete(tabId);
        });
}

/**
 * Extrait le favicon réel déclaré par la page chargée dans la webview
 * (balises <link>) et le fait vérifier/résoudre par le main process ; à
 * défaut de balise déclarée, retombe sur l'URL deviné (<origin>/favicon.ico).
 * Appelée depuis attachWebviewListeners (landscape-views.js) au dom-ready.
 */
function extractFaviconFromWebview(wv, tabId) {
    if (!wv || !wv.executeJavaScript) return;
    wv.executeJavaScript(_FAVICON_EXTRACT_SCRIPT)
        .then(href => {
            if (!tabs.some(t => t.id === tabId)) return; // onglet fermé entre-temps
            const declared = (typeof href === 'string' && href) ? href : null;
            const tab = tabs.find(t => t.id === tabId);
            _resolveFavicon(tabId, declared || (tab ? _guessFaviconUrl(tab) : null));
        })
        .catch(() => {
            // Page sans accès JS (pdf, file://, etc.) → tenter le repli deviné
            const tab = tabs.find(t => t.id === tabId);
            if (tab) _resolveFavicon(tabId, _guessFaviconUrl(tab));
        });
}

/**
 * Retourne l'URL favicon déjà résolue et vérifiée pour un onglet (data: URL),
 * ou null si non résolue / aucune icône valide. Ne déclenche elle-même
 * aucune requête réseau — voir _resolveFavicon().
 */
function _getFaviconUrl(tab) {
    return _faviconCache.get(tab.id) || null;
}

function _onFaviconLoad(img, tabId) {
    // Si l'image se charge correctement on ne fait rien (déjà affichée)
}

function _onFaviconError(img, tabId) {
    // Garde anti-boucle conservée par sécurité, même si ce cas devrait être
    // quasi impossible désormais : seules des data: URL déjà validées par
    // le main process sont assignées à <img src> (hors repli SVG local).
    if (img.dataset.fallbackApplied === '1') return;
    img.dataset.fallbackApplied = '1';
    img.src = FAVICON_FALLBACK;
}

// ── Rendu des onglets ─────────────────────────────────────────────────────────

function renderTabs() {
    const bar    = document.getElementById('tab-bar');
    const addBtn = document.getElementById('add-tab-btn');

    // Retirer les onglets et les labels de groupe précédents
    bar.querySelectorAll('.tab, .tab-group-label, .tab-pinned-divider').forEach(el => el.remove());

    // ── Zone onglets épinglés ────────────────────────────────────────────────
    const pinned = pinnedList().filter(id => tabs.some(t => t.id === id));
    if (pinned.length > 0) {
        pinned.forEach(tabId => {
            const tab = tabs.find(t => t.id === tabId);
            if (tab) bar.insertBefore(_buildTabEl(tab, true), addBtn);
        });
        // Séparateur visuel
        const div = document.createElement('div');
        div.className = 'tab-pinned-divider';
        bar.insertBefore(div, addBtn);
    }

    // ── Onglets normaux (non épinglés) ───────────────────────────────────────
    // Construire la liste ordonnée en respectant les groupes
    const normalTabs = tabs.filter(t => !pinnedHas(t.id));
    const rendered   = new Set();

    // Parcourir les onglets dans leur ordre (tabs[]) en insérant les labels de groupe
    let lastGroupId = null;

    normalTabs.forEach(tab => {
        if (rendered.has(tab.id)) return;

        const gid = groupIdOf(tab.id);

        // Nouveau groupe : insérer le label
        if (gid && gid !== lastGroupId) {
            const labelEl = _buildGroupLabelEl(gid);
            bar.insertBefore(labelEl, addBtn);
            lastGroupId = gid;

            // Si groupe collapsed : ne pas afficher les onglets, juste passer
            if (groupIsCollapsed(gid)) {
                // Marquer tous les onglets du groupe comme rendus
                groupTabIds(gid).forEach(id => rendered.add(id));
                return;
            }
        }

        // Fin d'un groupe : si cet onglet n'a pas de groupe et le précédent en avait un
        if (!gid && lastGroupId) {
            lastGroupId = null;
        }

        rendered.add(tab.id);
        bar.insertBefore(_buildTabEl(tab, false), addBtn);
    });
}

/** Construit l'élément DOM d'un onglet. */
function _buildTabEl(tab, isPinned) {
    const type = getTabType(tab);
    const el   = document.createElement('div');
    const gid  = isPinned ? null : groupIdOf(tab.id);

    el.className = 'tab'
        + (tab.id === activeTabId       ? ' active'       : '')
        + (type === TAB_TYPE_SETTINGS   ? ' settings-tab' : '')
        + (isPinned                     ? ' tab-pinned'   : '')
        + (gid                          ? ' tab-in-group' : '');
    el.dataset.id   = tab.id;
    el.dataset.type = type;
    el.draggable    = !isPinned; // les épinglés ne peuvent pas être drag-out

    // Couleur de bordure inférieure si membre d'un groupe
    if (gid) {
        el.style.setProperty('--tab-group-color', groupColorOf(gid));
    }

    // ── Favicon (v0.6.0, résolution sûre via main process depuis v0.6.1) ────
    if (type !== TAB_TYPE_SETTINGS) {
        const faviconUrl = _getFaviconUrl(tab);
        const img = document.createElement('img');
        img.className = 'tab-favicon';
        img.width  = 16;
        img.height = 16;
        if (faviconUrl) {
            img.src = faviconUrl;
        } else {
            img.src = FAVICON_FALLBACK;
            // Pas encore résolu : tenter une résolution en arrière-plan (le
            // résultat, s'il y en a un, ne s'affichera qu'au prochain rendu).
            if (!_faviconCache.has(tab.id) && !_faviconPending.has(tab.id)) {
                _resolveFavicon(tab.id, _guessFaviconUrl(tab));
            }
        }
        img.addEventListener('load',  () => _onFaviconLoad(img, tab.id));
        img.addEventListener('error', () => _onFaviconError(img, tab.id));
        el.appendChild(img);
    }

    // ── Titre ────────────────────────────────────────────────────────────────
    if (!isPinned) {
        const title = document.createElement('span');
        title.className   = 'tab-title';
        title.textContent = (type === TAB_TYPE_SETTINGS)
            ? '⚙ ' + t('settings')
            : (tab.title || t('newTab'));
        el.appendChild(title);
    }

    // ── Bouton fermer (pas sur les épinglés en mode icon-only) ───────────────
    if (!isPinned) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'tab-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.title = t('closeTab') || 'Fermer';
        closeBtn.addEventListener('click', e => { e.stopPropagation(); closeTab(tab.id); });
        el.appendChild(closeBtn);
    }

    el.addEventListener('click', () => switchTab(tab.id));

    // ── Clic droit → menu contextuel natif OS (v0.6.0) ───────────────────────
    el.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        _showTabContextMenu(tab.id, isPinned);
    });

    // ── Drag & Drop ──────────────────────────────────────────────────────────
    if (!isPinned) {
        el.addEventListener('dragstart', _onTabDragStart);
        el.addEventListener('dragend',   _onTabDragEnd);
        el.addEventListener('dragover',  _onTabDragOver);
        el.addEventListener('dragleave', _onTabDragLeave);
        el.addEventListener('drop',      _onTabDrop);
    }

    return el;
}

/** Construit le label DOM d'un groupe. */
function _buildGroupLabelEl(groupId) {
    const el    = document.createElement('div');
    const color = groupColorOf(groupId);
    const name  = groupNameOf(groupId);
    const collapsed = groupIsCollapsed(groupId);
    const count = groupTabIds(groupId).length;

    el.className = 'tab-group-label' + (collapsed ? ' collapsed' : '');
    el.dataset.groupId = groupId;
    el.style.setProperty('--group-color', color);
    el.title = collapsed ? `${name} (${count})` : name;

    const dot  = document.createElement('span');
    dot.className   = 'tab-group-dot';

    const nameSpan  = document.createElement('span');
    nameSpan.className   = 'tab-group-name';
    nameSpan.textContent = collapsed ? `${name} (${count})` : name;

    el.appendChild(dot);
    el.appendChild(nameSpan);

    // Clic pour collapse/expand
    el.addEventListener('click', e => {
        e.stopPropagation();
        groupToggleCollapse(groupId);
        renderTabs();
        saveTabs();
    });

    // Clic droit pour renommer
    el.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        _showGroupContextMenu(groupId);
    });

    // Drag over le label → signale "drop dans ce groupe"
    el.addEventListener('dragover', e => {
        if (!_dragSrcId) return;
        e.preventDefault();
        _dragOverGroup = groupId;
        el.classList.add('drag-target-group');
    });
    el.addEventListener('dragleave', e => {
        if (_dragOverGroup === groupId) _dragOverGroup = null;
        el.classList.remove('drag-target-group');
    });
    el.addEventListener('drop', e => {
        e.preventDefault();
        el.classList.remove('drag-target-group');
        if (!_dragSrcId) return;
        // Ajouter l'onglet au groupe
        const srcTab = tabs.find(t => t.id === _dragSrcId);
        if (srcTab && !pinnedHas(_dragSrcId)) {
            groupAddTab(_dragSrcId, groupId);
            renderTabs();
            saveTabs();
        }
        _dragSrcId    = null;
        _dragOverGroup = null;
        _removeDropIndicator();
    });

    return el;
}

// ── Menu contextuel natif sur les onglets (v0.6.0) ───────────────────────────
// Déclenche un IPC vers main.js qui construit et affiche le menu natif OS.
// La réponse revient via le canal 'tab-context-menu-action'.

function _showTabContextMenu(tabId, isPinned) {
    const gid       = groupIdOf(tabId);
    const allGroups = groupsAll().map(g => ({ id: g.id, name: g.name }));
    window.dualview.showTabContextMenu({
        tabId,
        isPinned,
        inGroup:     !!gid,
        groupId:     gid || null,
        hasClosedTab: _closedTabsStack.length > 0,
        groups:      allGroups,
    });
}

function _showGroupContextMenu(groupId) {
    window.dualview.showGroupContextMenu({ groupId, name: groupNameOf(groupId) });
}

// Réponses du menu contextuel onglet (depuis main.js)
window.dualview.on('tab-context-menu-action', ({ action, tabId, groupId, groupName }) => {
    switch (action) {
        case 'reopen-closed':
            reopenLastClosedTab();
            break;
        case 'pin':
            if (pinnedList().length < 5) {
                pinnedAdd(tabId);
                renderTabs(); saveTabs();
            } else {
                showToast(t('pinnedMaxReached') || 'Maximum 5 onglets épinglés', 2500);
            }
            break;
        case 'unpin':
            pinnedRemove(tabId);
            renderTabs(); saveTabs();
            break;
        case 'add-to-group':
            // groupId peut être un groupe existant ou 'new'
            if (groupId === 'new') {
                const newGid = groupCreate();
                groupAddTab(tabId, newGid);
            } else {
                groupAddTab(tabId, groupId);
            }
            renderTabs(); saveTabs();
            break;
        case 'remove-from-group':
            groupRemoveTab(tabId);
            renderTabs(); saveTabs();
            break;
        case 'close':
            closeTab(tabId);
            break;
        default: break;
    }
});

// Réponse du menu contextuel groupe (renommage)
window.dualview.on('group-context-menu-action', ({ action, groupId, name }) => {
    if (action === 'rename' && name) {
        groupRename(groupId, name);
        renderTabs(); saveTabs();
    }
    if (action === 'delete') {
        groupDelete(groupId);
        renderTabs(); saveTabs();
    }
});

// ── Drag & Drop — handlers (v0.5.3 / v0.6.0) ─────────────────────────────────

function _onTabDragStart(e) {
    _dragSrcId = e.currentTarget.dataset.id;
    e.currentTarget.classList.add('tab-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', _dragSrcId);
}

function _onTabDragEnd(e) {
    e.currentTarget.classList.remove('tab-dragging');
    // Nettoyer les highlights de groupe
    document.querySelectorAll('.tab-group-label.drag-target-group')
        .forEach(el => el.classList.remove('drag-target-group'));
    _dragSrcId    = null;
    _dragOverGroup = null;
    _removeDropIndicator();
}

function _onTabDragOver(e) {
    if (!_dragSrcId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const targetEl = e.currentTarget;
    const targetId = targetEl.dataset.id;
    if (targetId === _dragSrcId) { _removeDropIndicator(); return; }

    const rect   = targetEl.getBoundingClientRect();
    const isLeft = (e.clientX - rect.left) < rect.width / 2;

    const bar    = document.getElementById('tab-bar');
    const addBtn = document.getElementById('add-tab-btn');

    if (!_dragIndicator) {
        _dragIndicator = document.createElement('div');
        _dragIndicator.className = 'tab-drop-indicator';
    }

    if (isLeft) {
        bar.insertBefore(_dragIndicator, targetEl);
    } else {
        bar.insertBefore(_dragIndicator, targetEl.nextSibling || addBtn);
    }
}

function _onTabDragLeave(e) {
    if (!e.currentTarget.parentElement.contains(e.relatedTarget)) {
        _removeDropIndicator();
    }
}

function _onTabDrop(e) {
    e.preventDefault();
    if (!_dragSrcId) return;

    const targetId = e.currentTarget.dataset.id;
    if (targetId === _dragSrcId) { _removeDropIndicator(); return; }

    const fromIdx = tabs.findIndex(t => t.id === _dragSrcId);
    const toIdx   = tabs.findIndex(t => t.id === targetId);
    if (fromIdx === -1 || toIdx === -1) { _removeDropIndicator(); return; }

    const rect       = e.currentTarget.getBoundingClientRect();
    const isLeft     = (e.clientX - rect.left) < rect.width / 2;
    const insertIdx  = isLeft ? toIdx : toIdx + 1;

    const [moved]    = tabs.splice(fromIdx, 1);
    const adjustedIdx = insertIdx > fromIdx ? insertIdx - 1 : insertIdx;
    tabs.splice(adjustedIdx, 0, moved);

    // ── Gestion de l'appartenance au groupe lors du drag (v0.6.0) ─────────
    const targetGid = groupIdOf(targetId);
    const srcGid    = groupIdOf(_dragSrcId);

    if (targetGid) {
        // L'onglet est droppé sur un onglet appartenant à un groupe → rejoindre le groupe
        groupAddTab(_dragSrcId, targetGid);
    } else if (srcGid) {
        // L'onglet est droppé hors d'un groupe → sortir du groupe
        groupRemoveTab(_dragSrcId);
    }

    _removeDropIndicator();
    renderTabs();
    saveTabs();
}

function _removeDropIndicator() {
    if (_dragIndicator && _dragIndicator.parentElement) {
        _dragIndicator.parentElement.removeChild(_dragIndicator);
    }
    _dragIndicator = null;
}

// ── Zone de drop "hors groupe" sur la barre elle-même (v0.6.1) ───────────────
// _onTabDragOver/_onTabDrop (sur un onglet) et le gestionnaire de
// _buildGroupLabelEl (sur un label) ne couvrent que les drops effectués
// directement SUR un élément cible. Déposer un onglet dans un espace vide
// de la barre (après le dernier onglet, avant le bouton "+", ou dans un
// interstice) n'avait donc aucun effet : l'onglet restait dans son groupe.
// Ces deux gestionnaires, posés une fois sur le conteneur statique #tab-bar,
// couvrent ce cas en filtrant sur e.target === bar (ignore les événements
// qui bouillonnent depuis un onglet/label enfant, déjà traités ailleurs).
function _onTabBarDragOver(e) {
    if (!_dragSrcId) return;
    if (e.target !== e.currentTarget) return; // bulle depuis un enfant → déjà géré
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const bar    = e.currentTarget;
    const addBtn = document.getElementById('add-tab-btn');
    if (!_dragIndicator) {
        _dragIndicator = document.createElement('div');
        _dragIndicator.className = 'tab-drop-indicator';
    }
    bar.insertBefore(_dragIndicator, addBtn);
}

function _onTabBarDrop(e) {
    if (!_dragSrcId) return;
    if (e.target !== e.currentTarget) return;
    e.preventDefault();

    const srcId   = _dragSrcId;
    const fromIdx = tabs.findIndex(t => t.id === srcId);
    if (fromIdx !== -1) {
        // Déplacer l'onglet en fin de liste, cohérent avec l'indicateur
        // affiché juste avant le bouton "+".
        const [moved] = tabs.splice(fromIdx, 1);
        tabs.push(moved);

        // Retirer du groupe (c'est tout le sens de ce drop "hors groupe") ;
        // les onglets épinglés ne sont jamais draggable donc srcId ne
        // devrait jamais en être un, mais on vérifie par défense.
        if (!pinnedHas(srcId) && groupIdOf(srcId)) {
            groupRemoveTab(srcId);
        }

        renderTabs();
        saveTabs();
    }

    _dragSrcId     = null;
    _dragOverGroup = null;
    _removeDropIndicator();
}

document.getElementById('tab-bar').addEventListener('dragover', _onTabBarDragOver);
document.getElementById('tab-bar').addEventListener('drop',     _onTabBarDrop);

// ── switchTab ─────────────────────────────────────────────────────────────────

function switchTab(id) {
    activeTabId = id;
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;
    if (isSettingsTab(tab)) {
        webviewPool.forEach(wv => wv.classList.remove('active'));
        emptyState.classList.add('hidden');
        webviewCont.style.display = 'none';
        settingsPanel.classList.add('show');
        document.getElementById('url-input').value = 'dualview://paramètres';
        document.getElementById('url-input').classList.add('settings-url');
        document.getElementById('go-btn').disabled = true;
        updateNavButtons({ canGoBack: false, canGoForward: false });
        updateFavoriteBtn(false);
        window.dualview.switchTab(SETTINGS_TAB_ID);
    } else {
        webviewCont.style.display = 'flex';
        settingsPanel.classList.remove('show');
        document.getElementById('url-input').classList.remove('settings-url');
        document.getElementById('go-btn').disabled = false;
        document.getElementById('url-input').value = tab.url || '';
        const isNewWebview = !webviewPool.has(id);
        if (isNewWebview) createWebview(id, tab.url || '');
        showWebview(id);
        const wv = getActiveWebview();
        if (!isNewWebview && wv && wv.canGoBack) {
            try {
                // v0.9.0 — utilise navHooks.navState pour tenir compte du mode simulé
                const navState = (typeof navHooks !== 'undefined')
                    ? navHooks.navState(wv)
                    : { canGoBack: wv.canGoBack(), canGoForward: wv.canGoForward ? wv.canGoForward() : false };
                updateNavButtons(navState);
            } catch (_) {
                updateNavButtons({ canGoBack: false, canGoForward: false });
            }
        } else {
            // v0.9.0 — même si la webview est neuve, la pile simulée peut avoir du contenu
            const simBack = (typeof simCanGoBack !== 'undefined') ? simCanGoBack(id) : false;
            const simFwd  = (typeof simCanGoForward !== 'undefined') ? simCanGoForward(id) : false;
            updateNavButtons({ canGoBack: simBack, canGoForward: simFwd });
        }
        window.dualview.switchTab(id);
        refreshFavoriteBtnForUrl(tab.url || '');
    }
    renderTabs(); saveTabs(); resetVideoCounters();
}

function openSettingsTab(section) {
    const existing = tabs.find(t => t.id === SETTINGS_TAB_ID);
    if (existing) { switchTab(SETTINGS_TAB_ID); }
    else {
        tabs.push({ id: SETTINGS_TAB_ID, title: 'Paramètres', url: 'dualview://settings', type: TAB_TYPE_SETTINGS });
        switchTab(SETTINGS_TAB_ID);
    }
    if (section) setTimeout(() => activateSettingsSection(section), 50);
}

function activateSettingsSection(section) {
    document.querySelectorAll('.s-nav').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.s-section').forEach(s => s.classList.remove('active'));
    const nav = document.querySelector(`.s-nav[data-section="${section}"]`);
    if (nav) nav.classList.add('active');
    const sec = document.getElementById(`section-${section}`);
    if (sec) sec.classList.add('active');
    if (section === 'services') loadServicesStatus();
    if (section === 'obs') loadObsInfo();
}

// ── addTab / closeTab / saveTabs ──────────────────────────────────────────────

function addTab() {
    const id  = 'tab-' + Date.now();
    const url = getNewTabUrl();
    const type = url ? TAB_TYPE_WEB : TAB_TYPE_BLANK;
    tabs.push({ id, title: url ? '' : t('newTab'), url, type });
    switchTab(id);
}

function addTabWithUrl(url, title) {
    const id = 'tab-' + Date.now();
    if (!title) {
        title = '';
        try { title = new URL(url).hostname.replace('www.', ''); } catch { title = url.slice(0, 20); }
    }
    tabs.push({ id, title, url, type: TAB_TYPE_WEB });
    switchTab(id);
}

function getNewTabUrl() {
    const mode = currentSettings.newTabMode || 'homepage';
    if (mode === 'empty') return '';
    const hp = currentSettings.homepageMode || 'knack3';
    if (hp === 'empty') return '';
    if (hp === 'custom') return currentSettings.customHomepageUrl || '';
    return 'https://marketplace.atlassian.com/vendors/920480808/';
}

function closeTab(id) {
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex(t => t.id === id);
    const tab = tabs[idx];
    if (tab) _pushClosedTab(tab);   // v0.6.0 : mémoriser avant suppression

    // Nettoyer l'appartenance au groupe
    groupRemoveTab(id);
    pinnedRemove(id);
    _faviconCache.delete(id);
    _faviconPending.delete(id);
    // v0.9.0 — nettoyer la pile de navigation simulée
    if (typeof _cleanupNavStack === 'function') _cleanupNavStack(id);

    tabs = tabs.filter(t => t.id !== id);
    destroyWebview(id);
    if (activeTabId === id) switchTab(tabs[Math.max(0, idx - 1)].id);
    else { renderTabs(); saveTabs(); }
}

function saveTabs() {
    const persist       = tabs.filter(t => t.id !== SETTINGS_TAB_ID);
    const groupPayload  = groupsSavePayload();
    window.dualview.saveTabs({
        tabs:       persist.length ? persist : tabs,
        activeTabId,
        ...groupPayload,          // groups, tabGroupOf, pinnedTabs (v0.6.1)
    });
}

document.getElementById('add-tab-btn').addEventListener('click', addTab);

// ── Raccourci Ctrl+Shift+T (rouvrir onglet fermé) ────────────────────────────
// Géré dans landscape-settings.js (section clavier), mais on expose la fonction globalement.
// Le handler est dans le bloc keydown de landscape-settings.js — on vérifie ici
// que la fonction reopenLastClosedTab est disponible globalement (elle l'est car
// définie dans ce fichier chargé avant landscape-settings.js).

// ── Commandes OBS (v0.3.2) ───────────────────────────────────────────────────
window.dualview.on('obs-command', ({ action, payload }) => {
    payload = payload || {};
    switch (action) {
        case 'nav-back':    if (!backBtn.disabled) window.dualview.navBack(); break;
        case 'nav-forward': if (!forwardBtn.disabled) window.dualview.navForward(); break;
        case 'nav-reload':  document.getElementById('reload-btn').click(); break;
        case 'nav-home':    document.getElementById('home-btn').click(); break;
        case 'navigate':    if (payload.url && activeTabId !== SETTINGS_TAB_ID) navigate(payload.url); break;
        case 'tab-new':     addTab(); break;
        case 'tab-close':   closeTab(payload.tabId || activeTabId); break;
        case 'tab-switch':  if (payload.tabId && tabs.some(t => t.id === payload.tabId)) switchTab(payload.tabId); break;
        default: break;
    }
});

// ── Résolution input v0.4.0 ────────────────────────────────────────────────────
const KNOWN_TLDS = new Set([
    'com','net','org','fr','io','co','uk','de','app','dev','ai','eu',
    'info','biz','me','tv','us','ca','au','jp','it','es','nl','be','ch',
    'at','pl','ru','br','in','cn','kr','se','no','fi','dk','nz','sg',
    'gov','edu','mil','int','museum',
]);

function resolveInput(raw) {
    const text = raw.trim();
    if (!text) return '';
    if (/^https?:\/\//i.test(text) || /^file:\/\//i.test(text)) return text;
    if (/^localhost(:\d+)?(\/.*)?$/.test(text) || /^\d{1,3}(\.\d{1,3}){3}/.test(text)) return 'http://' + text;
    if (/\s/.test(text)) return buildSearchUrl(text);
    const parts = text.split('.');
    if (parts.length >= 2) {
        const tld = parts[parts.length - 1].toLowerCase().split('/')[0].split('?')[0];
        if (KNOWN_TLDS.has(tld)) return 'https://' + text;
    }
    return buildSearchUrl(text);
}

function buildSearchUrl(query) {
    const engineUrl = currentSettings.searchEngineUrl || 'https://duckduckgo.com/?q=';
    return engineUrl + encodeURIComponent(query);
}

function getEngineName() {
    return currentSettings.searchEngineName || 'DuckDuckGo';
}

// ── Navigation URL ─────────────────────────────────────────────────────────────
function navigate(rawInput) {
    if (!rawInput || activeTabId === SETTINGS_TAB_ID) return;
    closeOmnibar();
    const url = resolveInput(rawInput);
    if (!url) return;
    document.getElementById('url-input').value = url;
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab && !isSettingsTab(tab)) {
        tab.url = url;
        try {
            const host = new URL(url).hostname.replace('www.', '');
            tab.title = host.length > 18 ? host.slice(0, 18) + '…' : host;
        } catch { tab.title = url.slice(0, 20); }
        renderTabs(); saveTabs();
    }
    updateNavButtons({ canGoBack: false, canGoForward: false });
    // Pas d'assignation directe de wv.src ici : on laisse le round-trip IPC
    // (navigate → main.js → load-url) déclencher la navigation une seule fois.
    // Une double assignation (ici + dans le handler 'load-url') causait deux
    // navigations concurrentes vers la même URL → ERR_ABORTED (-3) côté
    // Chromium, la seconde annulant la première (cf. logs : github.com,
    // myinstants.com).
    window.dualview.navigate(url);
}

// ── Omnibar ────────────────────────────────────────────────────────────────────
const urlInput      = document.getElementById('url-input');
const omniDropdown  = document.getElementById('omnibar-dropdown');
let omniItems       = [];
let omniSelectedIdx = -1;
const tabHistory    = new Map();

function addToHistory(tabId, url) {
    if (!url || url === 'about:blank') return;
    if (!tabHistory.has(tabId)) tabHistory.set(tabId, []);
    const hist     = tabHistory.get(tabId);
    const existing = hist.indexOf(url);
    if (existing !== -1) hist.splice(existing, 1);
    hist.unshift(url);
    if (hist.length > 10) hist.pop();
}

function buildOmniItems(query) {
    const q     = query.trim().toLowerCase();
    if (!q) return [];
    const items = [];
    const seen  = new Set();
    for (const [, hist] of tabHistory) {
        for (const url of hist) {
            if (!seen.has(url) && url.toLowerCase().includes(q)) {
                seen.add(url);
                let label = url;
                try { label = new URL(url).hostname.replace('www.', ''); } catch { }
                items.push({ type: 'history', url, label, sub: url });
                if (items.length >= 4) break;
            }
        }
        if (items.length >= 4) break;
    }
    if (!/\s/.test(q) && q.length > 2 && !q.includes('/')) {
        const suggestion = q.endsWith('.com') ? q : q + '.com';
        if (!seen.has('https://' + suggestion))
            items.push({ type: 'domain', url: 'https://' + suggestion, label: suggestion, sub: '' });
    }
    items.push({ type: 'search', url: buildSearchUrl(query), label: query, sub: getEngineName() });
    return items;
}

function renderOmnibar(query) {
    omniItems = buildOmniItems(query);
    omniSelectedIdx = -1;
    if (!omniItems.length) { closeOmnibar(); return; }
    omniDropdown.innerHTML = '';
    let hasHistory = omniItems.some(i => i.type === 'history');
    let hasDomain  = omniItems.some(i => i.type === 'domain');
    omniItems.forEach((item, idx) => {
        if (item.type === 'search') {
            const row = document.createElement('div');
            row.className = 'omni-search-row';
            row.innerHTML = `<span>🔍</span><span>Rechercher &ldquo;${escHtml(item.label)}&rdquo; avec</span><span class="omni-engine-pill">${escHtml(item.sub)}</span>`;
            row.addEventListener('mousedown', e => { e.preventDefault(); navigate(item.label); });
            omniDropdown.appendChild(row);
        } else {
            if (item.type === 'history' && idx === 0 && hasHistory) {
                const lbl = document.createElement('div');
                lbl.className = 'omni-section-lbl';
                lbl.textContent = 'Historique';
                omniDropdown.appendChild(lbl);
            }
            if (item.type === 'domain' && hasDomain) {
                const div2 = document.createElement('div');
                div2.className = 'omni-divider';
                omniDropdown.appendChild(div2);
                const lbl2 = document.createElement('div');
                lbl2.className = 'omni-section-lbl';
                lbl2.textContent = 'Suggestion';
                omniDropdown.appendChild(lbl2);
            }
            const row  = document.createElement('div');
            row.className = 'omni-item';
            row.dataset.idx = idx;
            const icon = item.type === 'history' ? '🕐' : '🌐';
            row.innerHTML = `<span class="omni-icon">${icon}</span><span class="omni-url">${escHtml(item.url)}</span>${item.sub ? `<span class="omni-sub">${escHtml(item.sub)}</span>` : ''}`;
            row.addEventListener('mousedown', e => { e.preventDefault(); navigate(item.url); });
            omniDropdown.appendChild(row);
        }
    });
    omniDropdown.classList.add('open');
}

function closeOmnibar() {
    omniDropdown.classList.remove('open');
    omniItems       = [];
    omniSelectedIdx = -1;
}

function omniSelectIdx(idx) {
    omniDropdown.querySelectorAll('.omni-item,.omni-search-row').forEach((el, i) => {
        el.classList.toggle('selected', i === idx);
    });
    omniSelectedIdx = idx;
}

// ── Events barre URL ───────────────────────────────────────────────────────────
urlInput.addEventListener('focus', () => {
    if (activeTabId !== SETTINGS_TAB_ID) urlInput.select();
});
urlInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab && !isSettingsTab(tab)) urlInput.value = tab.url || '';
        closeOmnibar(); urlInput.blur(); return;
    }
    if (e.key === 'Enter') {
        const selItems = omniDropdown.querySelectorAll('.omni-item,.omni-search-row');
        if (omniSelectedIdx >= 0 && omniSelectedIdx < selItems.length) {
            const selectedItem = omniItems[omniSelectedIdx] || omniItems[omniItems.length - 1];
            if (selectedItem) { navigate(selectedItem.type === 'search' ? selectedItem.label : selectedItem.url); return; }
        }
        navigate(urlInput.value); return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); const total = omniDropdown.querySelectorAll('.omni-item,.omni-search-row').length; omniSelectIdx(Math.min(omniSelectedIdx + 1, total - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); omniSelectIdx(Math.max(omniSelectedIdx - 1, 0)); return; }
});
urlInput.addEventListener('input', () => {
    const q = urlInput.value;
    if (q.trim().length < 2) { closeOmnibar(); return; }
    renderOmnibar(q);
});
urlInput.addEventListener('blur', () => { setTimeout(closeOmnibar, 150); });

document.getElementById('go-btn').addEventListener('click', () => navigate(urlInput.value));

window.dualview.on('update-addressbar', url => {
    if (activeTabId === SETTINGS_TAB_ID) return;
    document.getElementById('url-input').value = url;
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab && !isSettingsTab(tab)) {
        tab.url = url;
        try {
            const host = new URL(url).hostname.replace('www.', '');
            tab.title = host.length > 18 ? host.slice(0, 18) + '…' : host;
        } catch { tab.title = url.slice(0, 20); }
        // Invalider le cache favicon lors d'un changement d'URL
        _faviconCache.delete(tab.id);
        _faviconPending.delete(tab.id);
        renderTabs(); saveTabs();
    }
    refreshFavoriteBtnForUrl(url);
});

window.dualview.on('load-url', url => {
    if (activeTabId === SETTINGS_TAB_ID) return;
    const wv = getActiveWebview();
    if (!wv || !url || url === 'about:blank') return;
    try { wv.src = url; }
    catch (e) { wv.addEventListener('dom-ready', () => { wv.src = url; }, { once: true }); }
    emptyState.classList.add('hidden');
    wv.classList.remove('is-blank');
    wv.classList.add('active');
});

// ── Screenshot (v0.4.0) ────────────────────────────────────────────────────────
document.getElementById('screenshot-btn').addEventListener('click', async () => {
    const result = await window.dualview.takeScreenshot();
    if (result && result.success) showToast(t('screenshotOk') + ' — ' + result.dir, 4000);
    else showToast(t('screenshotErr'));
});