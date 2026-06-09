--[[
  DualView - OBS Hotkeys Script
  Version: 0.3.2

  Méthode 3 : ajoute de VRAIES hotkeys natives OBS qui commandent DualView.

  Chaque hotkey envoie une requête HTTP POST vers le serveur de contrôle
  local de DualView (127.0.0.1). Les hotkeys apparaissent dans :
      Fichier → Paramètres → Raccourcis clavier  (rubrique "DualView : ...")

  INSTALLATION
    1. Lancer DualView. Ouvrir Paramètres → OBS et noter le PORT et le TOKEN.
    2. Dans OBS : Outils → Scripts → onglet "Scripts" → "+" → choisir ce fichier.
    3. Renseigner le Port et le Token dans les propriétés du script (à droite).
    4. Dans Paramètres → Raccourcis clavier, attribuer une touche à chaque
       action "DualView : ...".

  Ce script n'utilise aucune bibliothèque externe : il appelle curl.
    - Windows 10/11 : curl est inclus dans le système (C:\Windows\System32\curl.exe)
    - macOS          : curl est inclus par défaut
    - Linux          : installer curl si absent (ex. : apt install curl)
]]

obs = obslua

-- Réglages configurables via les propriétés du script
local settings_port  = "0"
local settings_token = ""

-- Table : identifiant interne -> { libellé hotkey, action DualView }
local ACTIONS = {
    sync_pause   = { label = "DualView : Pause synchronisation",     action = "sync-pause"   },
    sync_resume  = { label = "DualView : Reprendre synchronisation", action = "sync-resume"  },
    sync_restart = { label = "DualView : Redémarrer synchronisation",action = "sync-restart" },
    nav_back     = { label = "DualView : Page précédente",           action = "nav-back"     },
    nav_forward  = { label = "DualView : Page suivante",             action = "nav-forward"  },
    nav_reload   = { label = "DualView : Recharger",                 action = "nav-reload"   },
    nav_home     = { label = "DualView : Page d'accueil",            action = "nav-home"     },
    tab_new      = { label = "DualView : Nouvel onglet",             action = "tab-new"      },
    tab_close    = { label = "DualView : Fermer l'onglet actif",     action = "tab-close"    },
}

-- Stockage des identifiants de hotkey enregistrés
local hotkey_ids = {}

-- Détection de l'OS (évalué une seule fois au chargement du script)
local IS_WINDOWS = package.config:sub(1,1) == '\\'

-- Envoie une commande à DualView via curl (non bloquant, cross-platform)
local function send_command(action)
    if settings_port == "0" or settings_token == "" then
        obs.script_log(obs.LOG_WARNING, "DualView : port ou token non configuré.")
        return
    end
    local url  = string.format("http://127.0.0.1:%s/command", settings_port)
    local body = string.format('{"action":"%s"}', action)
    local escaped_body  = body:gsub('"', IS_WINDOWS and '\\"' or '\\"')
    local escaped_token = settings_token

    local cmd
    if IS_WINDOWS then
        -- start "" /B : lance curl en arrière-plan sans fenêtre bloquante
        cmd = string.format(
            'start "" /B curl -s -X POST -H "Content-Type: application/json" '
            .. '-H "X-DualView-Token: %s" -d "%s" "%s"',
            escaped_token, escaped_body, url
        )
    else
        -- macOS / Linux : & en fin de commande pour lancer en arrière-plan
        cmd = string.format(
            'curl -s -X POST -H "Content-Type: application/json" '
            .. "-H 'X-DualView-Token: %s' -d '%s' '%s' &",
            escaped_token, body, url
        )
    end
    os.execute(cmd)
end

-- ── Propriétés affichées dans OBS ────────────────────────────────────────────
function script_description()
    return [[<b>DualView — Contrôle par hotkeys</b><br/>
    Pilote la synchronisation, la navigation et les onglets de DualView
    depuis les raccourcis clavier natifs d'OBS.<br/><br/>
    Renseignez le <b>Port</b> et le <b>Token</b> affichés dans
    DualView → Paramètres → OBS, puis attribuez vos touches dans
    Paramètres → Raccourcis clavier.]]
end

function script_properties()
    local props = obs.obs_properties_create()
    obs.obs_properties_add_text(props, "port",  "Port DualView",  obs.OBS_TEXT_DEFAULT)
    obs.obs_properties_add_text(props, "token", "Token DualView", obs.OBS_TEXT_PASSWORD)
    return props
end

function script_defaults(settings)
    obs.obs_data_set_default_string(settings, "port", "0")
    obs.obs_data_set_default_string(settings, "token", "")
end

function script_update(settings)
    settings_port  = obs.obs_data_get_string(settings, "port")
    settings_token = obs.obs_data_get_string(settings, "token")
end

-- ── Cycle de vie : enregistrement des hotkeys ────────────────────────────────
function script_load(settings)
    for key, def in pairs(ACTIONS) do
        local id = obs.obs_hotkey_register_frontend(
            "dualview_" .. key, def.label,
            function(pressed)
                if pressed then send_command(def.action) end
            end
        )
        hotkey_ids[key] = id
        -- Restaurer les touches sauvegardées
        local arr = obs.obs_data_get_array(settings, "dualview_hotkey_" .. key)
        obs.obs_hotkey_load(id, arr)
        obs.obs_data_array_release(arr)
    end
end

function script_save(settings)
    for key, id in pairs(hotkey_ids) do
        local arr = obs.obs_hotkey_save(id)
        obs.obs_data_set_array(settings, "dualview_hotkey_" .. key, arr)
        obs.obs_data_array_release(arr)
    end
end
