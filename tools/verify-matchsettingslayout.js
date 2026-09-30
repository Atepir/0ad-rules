/**
 * Offline verification of the MatchSetupLayout helper of the "rules" mod.
 *
 * Loads the real helper with stubbed engine globals and checks that it repairs the layouts
 * that are actually out there:
 *
 *  - the vanilla layout of 0.28,
 *  - the layout of feldmap 3.0.1, whose "Player" tab still lists "PopulationCapType", a
 *    control that no longer exists (selecting that tab throws in GameSettingsPanel),
 *  - the layout this mod used to ship, which already contains its own settings.
 *
 * Usage: node tools/verify-matchsettingslayout.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const helperPath = path.join(__dirname, "..", "gui", "gamesetup", "Pages", "GameSetupPage",
    "GameSettings", "Single", "Dropdowns", "MatchSettingsLayout.js");
const source = fs.readFileSync(helperPath, "utf8");

const failures = [];
const check = (condition, message) => {
    if (!condition)
        failures.push(message);
};

/**
 * Loads the helper against a layout and returns what it did to it.
 *
 * @param {Object} layout - Tabs with a "settings" array, as GameSettingsLayout.js defines them.
 * @param {string[]} controlNames - Names that have a control.
 * @param {number} updateCalls - How often GameSettingsPanel.updateSize() runs.
 */
function runHelper(layout, controlNames, updateCalls = 1, report = true) {
    const gameSettingControls = {};
    for (const name of controlNames)
        gameSettingControls[name] = { category: -1 };

    // The stubs stand in for the engine globals and for the vanilla class the helper hooks. The
    // helper only reports when a maintainer turned the reporting on, which is what "report" is.
    const stubs = `
		var g_GameSettingsLayout = ${JSON.stringify(layout)};
		var g_Warnings = [];
		var g_RulesReport = ${report};
		var g_UpdateCalls = 0;
		function warn(message) { g_Warnings.push(message); }
		class GameSettingControlManager
		{
			updateSettingVisibility() { ++g_UpdateCalls; }
		}
	`;

    const api = new Function(stubs + source + `
		return {
			manager: new GameSettingControlManager(),
			layout: () => g_GameSettingsLayout,
			warnings: () => g_Warnings,
			updateCalls: () => g_UpdateCalls
		};
	`)();

    // What GameSettingControlManager's constructor does.
    api.manager.gameSettingControls = gameSettingControls;

    // What GameSettingsPanel.updateSize() does.
    for (let call = 0; call < updateCalls; ++call)
        api.manager.updateSettingVisibility();

    return {
        layout: api.layout(),
        warnings: api.warnings(),
        controls: gameSettingControls,
        updateCalls: api.updateCalls()
    };
}

/** The settings names that the mod's controls are named after. */
const ownNames = ["DisabledTemplates", "EnabledTemplates"];

/** Every name the vanilla 0.28 game defines a control for, plus this mod's two. */
const vanillaControls = [
    "MapType", "MapFilter", "MapSelection", "MapBrowser", "MapSize", "PlayerPlacement",
    "Landscape", "Biome", "WaterLevel", "SeaLevelRiseTime", "Daytime", "TriggerDifficulty",
    "Nomad", "Treasures", "ExploredMap", "RevealedMap", "AlliedView",
    "PlayerCount", "WorldPopulation", "PopulationCap", "WorldPopulationCap", "StartingResources",
    "Spies", "Cheats",
    "conquest", "regicide",
    "RelicCount", "RelicDuration", "RegicideGarrison", "WonderDuration", "GameSpeed",
    "Ceasefire", "LockedTeams", "LastManStanding", "Rating",
    ...ownNames
];

const vanillaLayout = [
    { "label": "Map", "settings": ["MapType", "MapFilter", "MapSelection", "MapBrowser", "MapSize", "AlliedView"] },
    { "label": "Player", "settings": ["PlayerCount", "PopulationCap", "StartingResources", "Spies", "Cheats"] },
    { "label": "Game Type", "settings": ["conquest", "Rating"] }
];

/** feldmap 3.0.1, whose Player tab still lists the 0.27 setting. */
const staleLayout = [
    { "label": "Map", "settings": ["MapType", "Balanced", "Shuffle", "AlliedView"] },
    { "label": "Player", "settings": ["PlayerCount", "PopulationCapType", "PopulationCap", "StartingResources", "Spies", "Cheats"] },
    { "label": "Game Type", "settings": ["conquest", "Rating"] }
];

const staleControls = vanillaControls.concat(["Balanced", "Shuffle"]);

/** The layout this mod shipped up to v0.1. */
const ownLayout = [
    { "label": "Map", "settings": ["MapType", "MapSize", "AlliedView"] },
    { "label": "Player", "settings": ["PlayerCount", "Spies", "DisabledTemplates", "EnabledTemplates", "Cheats"] },
    { "label": "Game Type", "settings": ["conquest", "Rating"] }
];

const playerIndex = layout => layout.findIndex(tab => tab.settings.indexOf("PlayerCount") != -1);
const settingsOf = (layout, tabIndex) => layout[tabIndex].settings;

// ---------------------------------------------------------------- the vanilla layout
{
    const result = runHelper(vanillaLayout, vanillaControls);
    const player = settingsOf(result.layout, 1);

    check(result.warnings.length == 0, "the vanilla layout must not warn: " + result.warnings);
    check(player.indexOf("DisabledTemplates") == player.indexOf("Spies") + 1 &&
        player.indexOf("EnabledTemplates") == player.indexOf("Spies") + 2,
        "both settings must be inserted after the last setting of the game: " + player);
    check(player.indexOf("EnabledTemplates") < player.indexOf("Cheats"),
        "both settings must be inserted before the anchor setting: " + player);
    check(result.controls.DisabledTemplates.category == 1 &&
        result.controls.EnabledTemplates.category == 1,
        "the controls must be assigned to the tab they were added to");
    check(result.updateCalls == 1,
        "the hooked method must still run (it computes the visibility of the controls)");
}

// --------------------------------------------------------------- the stale feldmap layout
{
    const result = runHelper(staleLayout, staleControls);
    const player = settingsOf(result.layout, 1);

    check(player.indexOf("PopulationCapType") == -1,
        "the setting this game version doesn't have must be dropped: " + player);
    check(result.warnings.length == 1 && result.warnings[0].indexOf("PopulationCapType") != -1,
        "dropping a setting must be reported: " + result.warnings);
    check(player.indexOf("DisabledTemplates") != -1 && player.indexOf("EnabledTemplates") != -1,
        "both settings must be added to a layout of another mod: " + player);
    check(settingsOf(result.layout, 0).indexOf("Balanced") != -1,
        "the settings of the other mod must be kept");
    check(result.controls.DisabledTemplates.category == 1,
        "the controls must be assigned to the tab they were added to");
}

// -------------------------------------------------------- the layout this mod used to ship
{
    const result = runHelper(ownLayout, vanillaControls);
    const player = settingsOf(result.layout, 1);

    check(result.warnings.length == 0, "an own layout must not warn: " + result.warnings);
    check(player.filter(name => name == "DisabledTemplates").length == 1 &&
        player.filter(name => name == "EnabledTemplates").length == 1,
        "the settings must not be added twice: " + player);
    check(result.controls.DisabledTemplates.category == 1,
        "the controls must be assigned to the tab holding them");
}

// ------------------------------------------------------------- a layout without player settings
{
    const result = runHelper([{ "label": "Map", "settings": ["MapType"] }], vanillaControls);
    check(result.warnings.length == 1, "a layout without player settings must warn: " + result.warnings);
    check(result.layout[0].settings.length == 1, "a layout without player settings must not be changed");
}

// --------------------------------------------------- GameSettingsPanel.positionSettings replay
{
    // positionSettings() throws as soon as a listed name has no control, for every tab.
    for (const [name, layout, controls] of [
        ["vanilla", vanillaLayout, vanillaControls],
        ["stale", staleLayout, staleControls],
        ["own", ownLayout, vanillaControls]
    ]) {
        const result = runHelper(layout, controls);
        check(result.updateCalls == 1, `${name}: the hooked method must still run`);

        for (const tab of result.layout)
            for (const setting of tab.settings)
                check(result.controls[setting],
                    `${name}: tab "${tab.label}" lists "${setting}", which has no control`);

        check(playerIndex(result.layout) != -1, `${name}: the player tab must survive the fixup`);
    }
}

// ------------------------------------------ the repair runs once, however often tabs change
{
    const result = runHelper(staleLayout, staleControls, 4);
    check(result.updateCalls == 4, "every layout update must still reach the vanilla method");
    check(result.warnings.length == 1, "the repair must only be reported once: " + result.warnings);
    check(settingsOf(result.layout, 1).filter(name => name == "DisabledTemplates").length == 1,
        "the settings must only be added once: " + settingsOf(result.layout, 1));
}

// -------------------------------------------------------------- a negative control
{
    // Without a layout update nothing runs, so the stale setting is still there. This proves
    // the checks above really observe the repair instead of a rewritten fixture.
    const result = runHelper(staleLayout, staleControls, 0);
    check(settingsOf(result.layout, 1).indexOf("PopulationCapType") != -1,
        "without a layout update the stale setting must still be listed");
    check(result.controls.DisabledTemplates.category == -1,
        "without a layout update the controls must still be in no tab");
}

// ---------------------------------------- players are never shown what the repair reports
{
    const reported = runHelper(staleLayout, staleControls, 1, true);
    const silent = runHelper(staleLayout, staleControls, 1, false);

    check(reported.warnings.length == 1,
        "a maintainer who asked for the reports must get them: " + reported.warnings);
    check(silent.warnings.length == 0,
        "a match must report nothing to its players: " + silent.warnings);
    check(JSON.stringify(silent.layout) == JSON.stringify(reported.layout),
        "reporting must not change what the repair does");
}

// ----------------------------------------------------- the file that caused all of this is gone
{
    const override = path.join(__dirname, "..", "gui", "gamesetup", "Pages", "GameSetupPage",
        "GameSettings", "GameSettingsLayout.js");
    check(!fs.existsSync(override),
        "the mod must not override GameSettingsLayout.js, only one mod can win that file");
}

if (failures.length) {
    console.error("FAILED:");
    for (const failure of failures)
        console.error("  - " + failure);
    process.exit(1);
}

console.log("MatchSetupLayout helper OK (vanilla, stale and own layouts).");
