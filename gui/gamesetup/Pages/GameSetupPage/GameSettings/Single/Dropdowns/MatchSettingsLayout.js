/**
 * Adds the settings of the "rules" mod to the Match Setup layout that is in effect.
 *
 * `GameSettingsLayout.js` lists which setting is shown in which tab of the Match Setup, so
 * adding a setting used to mean overriding that vanilla file. Only one copy of a file can win,
 * which makes such an override hostile to every other mod that does the same: the settings of
 * the mod that loses disappear from the Match Setup without a trace. A copy written for another
 * game version is worse than that, because `GameSettingsPanel.positionSettings` assumes every
 * name the layout lists is a control that exists: feldmap 3.0.1 still lists
 * "PopulationCapType" in the "Player" tab, a control that 0.28 dropped, so selecting that tab
 * throws `gameSettingControls[name] is undefined`.
 *
 * This mod therefore doesn't ship that file. It repairs the layout that ended up in use right
 * before it is laid out, which works with any copy and also fixes a stale one:
 *
 *  - settings without a control are dropped (with a warning),
 *  - this mod's controls are inserted into the tab that holds the player settings.
 */

/**
 * Names of the settings of the "Player" tab, in the order they are tried. No other tab has
 * those names, so they identify that tab even when a mod replaced the layout.
 */
var g_MatchSettingsLayoutPlayerSettingsNames = ["Cheats", "Spies", "StartingResources", "PlayerCount"];

/**
 * This mod's settings, in the order they are shown in the "Player" tab.
 */
var g_MatchSettingsLayoutControlNames = ["DisabledTemplates", "EnabledTemplates"];

/**
 * Whether the layout was repaired already, so that it is done once per page.
 */
var g_MatchSettingsLayoutPrepared = false;

/**
 * Repairs the layout of the Match Setup.
 *
 * @param {GameSettingControlManager} gameSettingControlManager
 */
function prepareMatchSettingsLayout(gameSettingControlManager)
{
	if (g_MatchSettingsLayoutPrepared)
		return;

	g_MatchSettingsLayoutPrepared = true;

	removeUnimplementedSettings(gameSettingControlManager.gameSettingControls);
	addMatchSettingsToTab(gameSettingControlManager);
}

/**
 * Drops the entries of the effective layout that no control implements, so that selecting a
 * tab can't throw because another mod shipped a layout of an older game version.
 *
 * @param {Object} gameSettingControls - The controls, keyed by name.
 */
function removeUnimplementedSettings(gameSettingControls)
{
	for (let tab of g_GameSettingsLayout)
		tab.settings = tab.settings.filter(name => {
			if (gameSettingControls[name])
				return true;

			warn("rules: ignoring the \"" + name + "\" Match Setup setting, " +
				"this game version has no setting with that name.");
			return false;
		});
}

/**
 * Inserts this mod's controls into the tab holding the player settings and points the controls
 * at that tab, because the tab decides whether a control is shown at all.
 *
 * @param {GameSettingControlManager} gameSettingControlManager
 */
function addMatchSettingsToTab(gameSettingControlManager)
{
	let tab = findPlayerSettingsTab();
	if (!tab)
	{
		warn("rules: couldn't find the tab to add the \"" +
			g_MatchSettingsLayoutControlNames.join("\", \"") + "\" settings to.");
		return;
	}

	// Inserted before the last setting of the tab, hence after the ones of the game and of
	// any mod that only appends its own.
	let missing = g_MatchSettingsLayoutControlNames.filter(name => tab.settings.indexOf(name) == -1);
	if (missing.length)
	{
		let anchor = g_MatchSettingsLayoutPlayerSettingsNames.find(name => tab.settings.indexOf(name) != -1);
		tab.settings.splice(tab.settings.indexOf(anchor), 0, ...missing);
	}

	// The controls ask for their tab when they are constructed, which happened before the
	// names above were added, so their category can still be "not in any tab".
	let category = g_GameSettingsLayout.indexOf(tab);
	for (let name of g_MatchSettingsLayoutControlNames)
		gameSettingControlManager.gameSettingControls[name].category = category;
}

/**
 * @returns {Object} The tab holding the player settings, or undefined if the effective layout
 *     has none.
 */
function findPlayerSettingsTab()
{
	for (let name of g_MatchSettingsLayoutPlayerSettingsNames)
		for (let tab of g_GameSettingsLayout)
			if (tab.settings.indexOf(name) != -1)
				return tab;

	return undefined;
}

/**
 * `GameSettingsPanel.updateSize` calls this immediately before it lays the settings of the
 * selected tab out, and never lays them out without calling it first, which makes it the one
 * point that guarantees the layout is repaired before it is read.
 */
var g_MatchSettingsLayoutUpdateSettingVisibility =
	GameSettingControlManager.prototype.updateSettingVisibility;

if (g_MatchSettingsLayoutUpdateSettingVisibility)
	GameSettingControlManager.prototype.updateSettingVisibility = function()
	{
		prepareMatchSettingsLayout(this);
		return g_MatchSettingsLayoutUpdateSettingVisibility.apply(this, arguments);
	};
else
	warn("rules: GameSettingControlManager.updateSettingVisibility is gone, " +
		"the Match Setup settings of this mod may not show up.");
