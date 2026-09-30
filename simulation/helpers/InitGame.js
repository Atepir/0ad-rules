/**
 * Called when the map has been loaded, but before the simulation has started.
 * Only called when a new game is started, not when loading a saved game.
 */
function PreInitGame() {
	// We need to replace skirmish "default" entities with real ones.
	// This needs to happen before AI initialization (in InitGame).
	// And we need to flush destroyed entities otherwise the AI gets the wrong game state in
	// the beginning and a bunch of "destroy" messages on turn 0, which just shouldn't happen.
	Engine.BroadcastMessage(MT_SkirmishReplace, {});
	Engine.FlushDestroyedEntities();

	let numPlayers = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager).GetNumPlayers();
	for (let i = 1; i < numPlayers; ++i) // ignore gaia
	{
		let cmpTechnologyManager = QueryPlayerIDInterface(i, IID_TechnologyManager);
		if (cmpTechnologyManager)
			cmpTechnologyManager.UpdateAutoResearch();
	}

	// Explore the map inside the players' territory borders
	let cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	cmpRangeManager.ExploreTerritories();
}

function InitGame(settings) {
	// No settings when loading a map in Atlas, so do nothing
	if (!settings) {
		// Map dependent initialisations of components (i.e. garrisoned units)
		Engine.BroadcastMessage(MT_InitGame, {});
		return;
	}

	if (settings.ExploreMap) {
		let cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
		for (let i = 1; i < settings.PlayerData.length; ++i)
			cmpRangeManager.ExploreMap(i);
	}

	const cmpAIManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_AIManager);

	// MOD: rules - the researches of the classes of units the host disabled are hidden and can't
	// be started (see the end of this file). This is decided once for the match, before any player
	// can look at a research panel.
	RulesHideResearches(settings);

	// MOD: rules - a mod that re-registers the Player component with a copy of it (autociv does
	// that for other components) leaves every player without the game's API, so the missing parts
	// are reported once for the match instead of once for each of its players.
	let rulesReportedPlayerApi = false;

	for (let i = 0; i < settings.PlayerData.length; ++i) {
		const cmpPlayer = QueryPlayerIDInterface(i);

		// MOD: rules - this is the game's own call. Without the guard it would abort the whole
		// match start, which hides the mod that caused it behind this one's name.
		if (cmpPlayer.SetCheatsEnabled)
			cmpPlayer.SetCheatsEnabled(!!settings.CheatsEnabled);
		else if (!rulesReportedPlayerApi) {
			rulesReportedPlayerApi = true;
			RulesReport("rules: this match runs with a Player component that isn't the game's, so " +
				"cheat settings can't be applied. A mod that re-registers that component is the " +
				"usual cause.");
		}

		// MOD: rules - apply the templates the host disabled in the match setup.
		// The templates may contain the "{civ}" placeholder, which is expanded for each player
		// when the MT_InitGame message below is broadcast (see Player.prototype.OnGlobalInitGame).
		// Templates disabled by other settings (e.g. the spy of "Disable Spies") are preserved.
		if (settings.DisabledTemplates && settings.DisabledTemplates.length) {
			if (!cmpPlayer.GetDisabledTemplates || !cmpPlayer.SetDisabledTemplates) {
				if (!rulesReportedPlayerApi) {
					rulesReportedPlayerApi = true;
					RulesReport("rules: this match runs with a Player component that isn't the " +
						"game's, so the classes of units the host disabled are not applied. A mod " +
						"that re-registers that component is the usual cause.");
				}
			}
			else {
				const disabledTemplates = cmpPlayer.GetDisabledTemplates();
				const disabled = Object.keys(disabledTemplates).filter(template => disabledTemplates[template]);
				cmpPlayer.SetDisabledTemplates(disabled.concat(
					settings.DisabledTemplates.filter(template => disabled.indexOf(template) == -1)));
			}
		}

		if (settings.PlayerData[i] && !!settings.PlayerData[i].AI) {
			cmpAIManager.AddPlayer(settings.PlayerData[i].AI, i, +settings.PlayerData[i].AIDiff, settings.PlayerData[i].AIBehavior || "random");
			cmpPlayer.SetAI(true);
		}

		if (settings.PopulationCap)
			cmpPlayer.SetMaxPopulation(settings.PopulationCap);

		if (settings.AllyView)
			Engine.QueryInterface(cmpPlayer.entity, IID_TechnologyManager)?.ResearchTechnology(Engine.QueryInterface(cmpPlayer.entity, IID_Diplomacy).template.SharedLosTech);
	}
	if (settings.WorldPopulationCap)
		Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager).SetMaxWorldPopulation(settings.WorldPopulationCap);

	// Update the grid with all entities created for the map init.
	Engine.QueryInterface(SYSTEM_ENTITY, IID_Pathfinder).UpdateGrid();

	// Map or player data (handicap...) dependent initialisations of components (i.e. garrisoned units).
	Engine.BroadcastMessage(MT_InitGame, {});

	cmpAIManager.TryLoadSharedComponent();
	cmpAIManager.RunGamestateInit();
}

Engine.RegisterGlobal("PreInitGame", PreInitGame);
Engine.RegisterGlobal("InitGame", InitGame);

/**
 * MOD: rules - the researches of the classes of units the host disabled.
 *
 * A research disappears when every unit it unlocks or improves is disabled. The unlocks are read
 * from the requirements of the unit templates ("<Techs>-phase_city unlock_champion_infantry")
 * and the improvements from the affects of the technology, so "Unlock Champion Infantry" stays as
 * long as another civilization can still train champion infantry, while "Immortals" goes as soon
 * as the Immortals are off.
 *
 * Researcher.GetTechnologiesList is what the research panel shows, where an undefined slot is a
 * research the game does not offer (that is how the game itself hides one), and CanResearch is
 * what the game and the AI ask before starting one.
 */

/**
 * The templates the host disabled, with the "{civ}" placeholder spelled out for the
 * civilizations of this match (the game expands it per player when the match starts, which is
 * after the researches are decided).
 *
 * @param {Object} settings - The game attributes of the match.
 * @returns {Set<string>}
 */
function RulesDisabledTemplates(settings) {
	const civilizations = settings.PlayerData
		.map(data => data && data.Civ)
		.filter((civ, index, all) => civ && all.indexOf(civ) == index);

	const disabled = new Set();
	for (const template of settings.DisabledTemplates)
		if (template.indexOf("{civ}") == -1)
			disabled.add(template);
		else
			for (const civ of civilizations)
				disabled.add(template.replace("{civ}", civ));

	return disabled;
}

/**
 * The unit templates of the game, with the classes the game tags them with and the researches
 * that unlock them (a "-" token is a research that must not be researched yet, so only the plain
 * ones unlock the unit).
 *
 * The scan is the one the Match Setup list does, so the two always agree on what a class covers.
 *
 * @param {Object} settings
 * @returns {Map<string, {classes: Set<string>, unlocks: string[]}>}
 */
function RulesMatchUnitTemplates(settings) {
	const units = new Map();

	for (const path of listFiles("simulation/templates/units/", ".xml", true)) {
		// By splitting on both separators the scan also works if the VFS returns
		// platform-dependent paths.
		const parts = path.split(/[\\/]/);
		if (parts.length != 2)
			continue;

		const name = "units/" + parts[0] + "/" + parts[1];
		const template = Engine.GetTemplate(name) || {};
		const identity = template.Identity || {};
		// The classes the host could pick, from the very field the Match Setup list reads, so the
		// disabled set and this scan always talk about the same units.
		const tokens = (identity.VisibleClasses || {})._string ||
			(identity.Classes || {})._string || "";
		// The templates declare their requirements inside their identity, and the game moves them
		// to the template itself once it is loaded, so look in both places.
		const requirements = ((template.Requirements || identity.Requirements || {}).Techs || {})._string || "";

		units.set(name, {
			"classes": new Set(tokens.split(" ").filter(token => token)),
			"unlocks": requirements.split(" ")
				.filter(token => token && token[0] != "-")
		});
	}

	return units;
}

/**
 * Whether a unit matches the "affects" queries of a technology: classes separated by spaces are
 * all required, and a "!" or "-" in front of one means the unit must not have it.
 *
 * @param {Set<string>} classes
 * @param {string[]} queries
 * @returns {boolean}
 */
function RulesMatchesAffects(classes, queries) {
	for (const query of queries)
		for (const token of query.split(" ")) {
			if (!token)
				continue;

			if (token[0] == "!" || token[0] == "-") {
				if (classes.has(token.slice(1)))
					return false;
			}
			else if (!classes.has(token))
				return false;
		}

	return true;
}

/**
 * The researches that have nothing left to unlock or improve, so the host does not pay for a
 * research of a class of units that can't be trained.
 *
 * @param {Object} settings
 * @returns {Set<string>}
 */
function RulesHiddenResearches(settings) {
	const hidden = new Set();
	if (!settings.DisabledTemplates || !settings.DisabledTemplates.length)
		return hidden;

	const disabled = RulesDisabledTemplates(settings);
	const units = RulesMatchUnitTemplates(settings);
	if (!units.size)
		return hidden;

	const technologies = TechnologyTemplates.GetAll();
	for (const name in technologies) {
		const technology = technologies[name];

		// What the research is for: the units it improves, and the ones it unlocks.
		const concerned = new Set();
		for (const [unit, data] of units)
			if (data.unlocks.indexOf(name) != -1)
				concerned.add(unit);

		const affects = (technology.affects || []).slice();
		for (const modification of technology.modifications || [])
			if (modification.affects)
				affects.push(...[].concat(modification.affects));

		if (affects.length)
			for (const [unit, data] of units)
				if (RulesMatchesAffects(data.classes, affects))
					concerned.add(unit);

		if (!concerned.size)
			continue;

		let somethingLeft = false;
		for (const unit of concerned)
			if (!disabled.has(unit))
				somethingLeft = true;

		if (!somethingLeft)
			hidden.add(name);
	}

	return hidden;
}

/**
 * Hides the researches found by RulesHiddenResearches, once per match.
 *
 * @param {Object} settings
 */
function RulesHideResearches(settings) {
	if (g_RulesHiddenResearches)
		return;

	g_RulesHiddenResearches = RulesHiddenResearches(settings);
	if (!g_RulesHiddenResearches.size)
		return;

	const listTechnologies = Researcher.prototype.GetTechnologiesList;
	Researcher.prototype.GetTechnologiesList = function () {
		return listTechnologies.call(this).map(name =>
			g_RulesHiddenResearches.has(name) ? undefined : name);
	};

	const canResearch = TechnologyManager.prototype.CanResearch;
	TechnologyManager.prototype.CanResearch = function (name) {
		return !g_RulesHiddenResearches.has(name) && canResearch.call(this, name);
	};

	RulesReport("rules: " + g_RulesHiddenResearches.size + " research(es) hidden because the " +
		"classes of units they unlock or improve are disabled: " +
		Array.from(g_RulesHiddenResearches).sort().join(", "));
}

/** The researches of the disabled classes, worked out when the match starts. */
let g_RulesHiddenResearches;

/**
 * Whether RulesReport writes to the game log. Off, so that a match says nothing to its players:
 * what the mod reports (a game update that moved something, another mod that re-registers a
 * component) is nothing they can do anything about. A maintainer debugging the mod sets this to
 * true to get the messages back.
 */
let g_RulesReport = false;

/**
 * Reports something to the maintainer of this mod, and to nobody else.
 *
 * @param {string} message
 */
function RulesReport(message) {
	if (g_RulesReport)
		warn(message);
}
