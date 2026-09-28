/**
 * This array determines the order in which the GUI controls are shown in the GameSettingTabs panel.
 * The names correspond to property names of the GameSettingControls prototype.
 *
 * MOD: rules - the "DisabledTemplates" and "EnabledTemplates" controls were added to the
 * "Player" tab, which let the host disable units for the whole match.
 */
var g_GameSettingsLayout = [
	{
		"label": translateWithContext("Match settings tab name", "Map"),
		"settings": [
			"MapType",
			"MapFilter",
			"MapSelection",
			"MapBrowser",
			"MapSize",
			"PlayerPlacement",
			"Landscape",
			"Biome",
			"WaterLevel",
			"SeaLevelRiseTime",
			"Daytime",
			"TriggerDifficulty",
			"Nomad",
			"Treasures",
			"ExploredMap",
			"RevealedMap",
			"AlliedView"
		]
	},
	{
		"label": translateWithContext("Match settings tab name", "Player"),
		"settings": [
			"PlayerCount",
			"WorldPopulation",
			"PopulationCap",
			"WorldPopulationCap",
			"StartingResources",
			"Spies",
			"DisabledTemplates",
			"EnabledTemplates",
			"Cheats"
		]
	},
	{
		"label": translateWithContext("Match settings tab name", "Game Type"),
		"settings": [
			...g_VictoryConditions.map(victoryCondition => victoryCondition.Name),
			"RelicCount",
			"RelicDuration",
			"RegicideGarrison",
			"WonderDuration",
			"GameSpeed",
			"Ceasefire",
			"LockedTeams",
			"LastManStanding",
			"Rating"
		]
	}
];
