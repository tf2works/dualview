/*
 * DualView - Groupes d'onglets et onglets épinglés
 * Version: 0.6.1
 *
 * Gestion distincte des groupes d'onglets et du groupe "épinglés" (pinned).
 * Délibérément séparé de landscape-tabs.js pour isoler les responsabilités
 * et éviter les effets de bord sur la logique de navigation existante.
 *
 * v0.6.1 :
 *   - groupAddTab() nettoie désormais l'ancien groupe d'un onglet avant de
 *     l'affecter à un nouveau groupe (corrige un groupe orphelin "zombie"
 *     resté invisible en mémoire/config lors d'un déplacement inter-groupes).
 *   - Les onglets épinglés sont désormais inclus dans groupsSavePayload()
 *     et donc persistés entre sessions (groupsLoad() les restaurait déjà,
 *     mais le payload de sauvegarde ne les transmettait jamais).
 *
 * Données :
 *   tabGroups  : Map<groupId, { id, name, color, collapsed }>
 *   tabGroupOf : Map<tabId, groupId>   — quel onglet appartient à quel groupe
 *   pinnedTabs : Set<tabId>            — onglets épinglés (groupe virtuel spécial)
 *
 * Palette de couleurs (attribution dans l'ordre, puis cycle) :
 *   GROUP_COLORS[0..9]
 *
 * API publique (consommée par landscape-tabs.js) :
 *   groupsInit()
 *   groupsSave()
 *   groupsLoad(data)            — restauration depuis store
 *   groupCreate(name?)          → groupId
 *   groupDelete(groupId)
 *   groupRename(groupId, name)
 *   groupAddTab(tabId, groupId)
 *   groupRemoveTab(tabId)
 *   groupToggleCollapse(groupId)
 *   groupNextColor()            → couleur hex suivante dans la palette
 *   groupColorOf(groupId)       → couleur hex du groupe
 *   groupNameOf(groupId)        → nom du groupe
 *   groupIsCollapsed(groupId)   → bool
 *   groupIdOf(tabId)            → groupId | null
 *   groupTabIds(groupId)        → tabId[]
 *   pinnedAdd(tabId)
 *   pinnedRemove(tabId)
 *   pinnedHas(tabId)            → bool
 *   pinnedList()                → tabId[]
 *   groupsSavePayload()         → { groups, tabGroupOf, pinnedTabs } pour save-tabs (persistance complète)
 *
 * Dépendances : aucune (module autonome)
 */

// ── Palette prédéfinie (10 couleurs, attribution dans l'ordre) ────────────────
const GROUP_COLORS = [
    '#e53935', // rouge
    '#1e88e5', // bleu
    '#43a047', // vert
    '#fb8c00', // orange
    '#8e24aa', // violet
    '#00acc1', // cyan
    '#f4511e', // rouge-orange
    '#6d4c41', // brun
    '#039be5', // bleu clair
    '#c0ca33', // jaune-vert
];

// ── État interne ──────────────────────────────────────────────────────────────
let tabGroups   = new Map();   // groupId → { id, name, color, collapsed }
let tabGroupOf  = new Map();   // tabId   → groupId
let pinnedTabs  = new Set();   // tabId

let _colorIdx   = 0;           // index courant dans GROUP_COLORS (attribution séquentielle)
let _groupSeq   = 0;           // compteur pour "Groupe N" auto-incrémenté

// ── Helpers internes ──────────────────────────────────────────────────────────

/** Génère un id de groupe unique. */
function _newGroupId() {
    return 'grp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
}

/** Génère un nom générique non dupliqué ("Groupe 1", "Groupe 2", …). */
function _nextGroupName() {
    const isFr = (typeof t === 'function') ? (t('group') !== 'group') : true;
    const prefix = isFr ? 'Groupe' : 'Group';
    let n = ++_groupSeq;
    // Éviter les doublons si des groupes ont été nommés avec ce préfixe
    const existingNames = new Set([...tabGroups.values()].map(g => g.name));
    while (existingNames.has(`${prefix} ${n}`)) n = ++_groupSeq;
    return `${prefix} ${n}`;
}

// ── API publique ──────────────────────────────────────────────────────────────

/** Initialise l'état (appelé au démarrage, avant groupsLoad). */
function groupsInit() {
    tabGroups.clear();
    tabGroupOf.clear();
    pinnedTabs.clear();
    _colorIdx = 0;
    _groupSeq = 0;
}

/**
 * Restaure les groupes depuis les données persistées (store).
 * @param {object} data  { groups: [...], tabGroupOf: {...}, pinnedTabs: [...] }
 */
function groupsLoad(data) {
    groupsInit();
    if (!data) return;

    if (Array.isArray(data.groups)) {
        for (const g of data.groups) {
            if (g && g.id && g.name) {
                tabGroups.set(g.id, {
                    id:        g.id,
                    name:      g.name,
                    color:     g.color || GROUP_COLORS[0],
                    collapsed: !!g.collapsed,
                });
            }
        }
    }

    if (data.tabGroupOf && typeof data.tabGroupOf === 'object') {
        for (const [tabId, groupId] of Object.entries(data.tabGroupOf)) {
            if (tabGroups.has(groupId)) tabGroupOf.set(tabId, groupId);
        }
    }

    if (Array.isArray(data.pinnedTabs)) {
        for (const tabId of data.pinnedTabs.slice(0, PINNED_MAX)) pinnedTabs.add(tabId);
    }

    // Recalibrer le compteur séquentiel pour éviter les doublons
    const isFr = true; // sera précisé à l'usage de _nextGroupName
    const re = /^(?:Groupe|Group) (\d+)$/;
    let maxN = 0;
    for (const g of tabGroups.values()) {
        const m = re.exec(g.name);
        if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    }
    _groupSeq = maxN;

    // Recalibrer l'index couleur
    _colorIdx = tabGroups.size % GROUP_COLORS.length;
}

/** Retourne la prochaine couleur de groupe selon la palette séquentielle. */
function groupNextColor() {
    const color = GROUP_COLORS[_colorIdx % GROUP_COLORS.length];
    _colorIdx++;
    return color;
}

/**
 * Crée un nouveau groupe.
 * @param {string} [name]  Nom du groupe (optionnel — généré si absent)
 * @returns {string} groupId
 */
function groupCreate(name) {
    const id    = _newGroupId();
    const color = groupNextColor();
    const gname = (name && name.trim().slice(0, 60)) || _nextGroupName();
    tabGroups.set(id, { id, name: gname, color, collapsed: false });
    return id;
}

/**
 * Supprime un groupe (les onglets membres deviennent "sans groupe").
 */
function groupDelete(groupId) {
    tabGroups.delete(groupId);
    for (const [tabId, gid] of tabGroupOf.entries()) {
        if (gid === groupId) tabGroupOf.delete(tabId);
    }
}

/**
 * Renomme un groupe.
 * @param {string} groupId
 * @param {string} name     Max 60 caractères
 */
function groupRename(groupId, name) {
    const g = tabGroups.get(groupId);
    if (!g) return;
    g.name = (name || '').trim().slice(0, 60) || g.name;
}

/**
 * Ajoute un onglet à un groupe.
 * Un onglet épinglé ne peut pas être ajouté à un groupe normal.
 * @returns {boolean}  true si succès
 */
function groupAddTab(tabId, groupId) {
    if (pinnedTabs.has(tabId)) return false;   // épinglé → groupe spécial, non transférable
    if (!tabGroups.has(groupId)) return false;
    const previousGroupId = tabGroupOf.get(tabId);
    if (previousGroupId && previousGroupId !== groupId) {
        // L'onglet change de groupe : on le retire proprement de l'ancien
        // (via groupRemoveTab, qui supprime aussi l'ancien groupe s'il
        // tombe sous 2 membres) avant de l'affecter au nouveau. Sans ça,
        // l'ancien groupe restait orphelin ("zombie") en mémoire et dans
        // la config persistée, sans plus jamais être affiché.
        groupRemoveTab(tabId);
    }
    tabGroupOf.set(tabId, groupId);
    return true;
}

/**
 * Retire un onglet de son groupe.
 * Si après retrait le groupe compte < 2 onglets, le groupe est supprimé.
 */
function groupRemoveTab(tabId) {
    const groupId = tabGroupOf.get(tabId);
    if (!groupId) return;
    tabGroupOf.delete(tabId);
    // Nettoyer le groupe s'il reste < 2 membres
    const remaining = groupTabIds(groupId);
    if (remaining.length < 2) groupDelete(groupId);
}

/** Bascule l'état collapsed d'un groupe. */
function groupToggleCollapse(groupId) {
    const g = tabGroups.get(groupId);
    if (g) g.collapsed = !g.collapsed;
}

/** Retourne la couleur d'un groupe. */
function groupColorOf(groupId) {
    const g = tabGroups.get(groupId);
    return g ? g.color : '#888';
}

/** Retourne le nom d'un groupe. */
function groupNameOf(groupId) {
    const g = tabGroups.get(groupId);
    return g ? g.name : '';
}

/** Retourne l'état collapsed d'un groupe. */
function groupIsCollapsed(groupId) {
    const g = tabGroups.get(groupId);
    return g ? g.collapsed : false;
}

/** Retourne le groupId de l'onglet, ou null. */
function groupIdOf(tabId) {
    return tabGroupOf.get(tabId) || null;
}

/** Retourne la liste des tabId membres d'un groupe. */
function groupTabIds(groupId) {
    const result = [];
    for (const [tabId, gid] of tabGroupOf.entries()) {
        if (gid === groupId) result.push(tabId);
    }
    return result;
}

/** Retourne tous les groupes sous forme de tableau. */
function groupsAll() {
    return [...tabGroups.values()];
}

// ── Épinglés ──────────────────────────────────────────────────────────────────
// Limite max : 5 onglets épinglés.
const PINNED_MAX = 5;

/**
 * Épingle un onglet.
 * Retire l'onglet de tout groupe normal avant d'épingler.
 * @returns {boolean}  true si succès
 */
function pinnedAdd(tabId) {
    if (pinnedTabs.size >= PINNED_MAX) return false;
    if (pinnedTabs.has(tabId)) return false;
    // Sortir du groupe normal (sans déclencher la suppression du groupe)
    tabGroupOf.delete(tabId);
    pinnedTabs.add(tabId);
    return true;
}

/** Désépingle un onglet. */
function pinnedRemove(tabId) {
    pinnedTabs.delete(tabId);
}

/** Retourne true si l'onglet est épinglé. */
function pinnedHas(tabId) {
    return pinnedTabs.has(tabId);
}

/** Retourne la liste des onglets épinglés (dans l'ordre d'insertion). */
function pinnedList() {
    return [...pinnedTabs];
}

// ── Persistance ───────────────────────────────────────────────────────────────

/**
 * Retourne le payload à inclure dans save-tabs pour persister les groupes
 * et les onglets épinglés.
 */
function groupsSavePayload() {
    const groups = [...tabGroups.values()].map(g => ({
        id:        g.id,
        name:      g.name,
        color:     g.color,
        collapsed: g.collapsed,
    }));
    const tabGroupOfObj = {};
    for (const [tabId, groupId] of tabGroupOf.entries()) tabGroupOfObj[tabId] = groupId;
    return { groups, tabGroupOf: tabGroupOfObj, pinnedTabs: pinnedList() };
}

