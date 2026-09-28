/**
 * The unit classes the host can disable, next to the individual units.
 *
 * The game tags every unit template with classes such as "Champion", "Infantry" or "Immortal".
 * A template inherits the tags of its parents (and of the civilization and unit mixins it is
 * built from), and the resolved list is what the game's own Reference page reads through
 * Engine.GetTemplate().Identity.VisibleClasses. A class entry here disables every unit whose
 * tags contain all of its "all" classes and none of its "none" classes, for every
 * civilization, so "All Champion Cavalry" disables the champion cavalry of the whole match at
 * once, whichever civilization trains them and whichever weapon and rank they have.
 *
 * Only the classes that mean something for a match are listed; the internal tags of the game
 * ("Builder", "Worker", "Ranged", "Bribable", "Relic", ...) are left out.
 *
 * The labels start with "All " on purpose: they are the coarse entries, and a unit family of
 * the list is named after its unit ("Champion Infantry"), so the two can be told apart.
 */
var g_UnitClassList = [
	// Soldiers, by rank and by the type of unit they fight from.
	{ "label": "All Champions", "all": ["Champion"] },
	{ "label": "All Champion Infantry", "all": ["Champion", "Infantry"] },
	{ "label": "All Champion Cavalry", "all": ["Champion", "Cavalry"] },
	{ "label": "All Champion Elephants", "all": ["Champion", "Elephant"] },

	{ "label": "All Heroes", "all": ["Hero"] },
	{ "label": "All Hero Infantry", "all": ["Hero", "Infantry"] },
	{ "label": "All Hero Cavalry", "all": ["Hero", "Cavalry"] },
	{ "label": "All Hero Elephants", "all": ["Hero", "Elephant"] },

	{ "label": "All Mercenaries", "all": ["Mercenary"] },
	{ "label": "All Mercenary Infantry", "all": ["Mercenary", "Infantry"] },
	{ "label": "All Mercenary Cavalry", "all": ["Mercenary", "Cavalry"] },

	// "Soldier" is on every soldier, champions and heroes included, so they are excluded here.
	{ "label": "All Citizen Soldiers", "all": ["Soldier"], "none": ["Champion", "Hero", "Mercenary"] },
	{ "label": "All Citizen Soldier Infantry", "all": ["Soldier", "Infantry"], "none": ["Champion", "Hero", "Mercenary"] },
	{ "label": "All Citizen Soldier Cavalry", "all": ["Soldier", "Cavalry"], "none": ["Champion", "Hero", "Mercenary"] },
	{ "label": "All Citizen Soldier Elephants", "all": ["Soldier", "Elephant"], "none": ["Champion", "Hero", "Mercenary"] },

	// Units that aren't soldiers.
	{ "label": "All Support Units", "all": ["Support"] },
	{ "label": "All Healers", "all": ["Healer"] },
	{ "label": "All Traders", "all": ["Trader"] },
	{ "label": "All Siege Units", "all": ["Siege"] },
	{ "label": "All Warships", "all": ["Warship"] },
	{ "label": "All Fishing Boats", "all": ["FishingBoat"] },

	// Weapons, across every rank and civilization.
	{ "label": "All Spearmen", "all": ["Spearman"] },
	{ "label": "All Swordsmen", "all": ["Swordsman"] },
	{ "label": "All Javelineers", "all": ["Javelineer"] },
	{ "label": "All Archers", "all": ["Archer"] },
	{ "label": "All Slingers", "all": ["Slinger"] },
	{ "label": "All Pikemen", "all": ["Pikeman"] },
	{ "label": "All Crossbowmen", "all": ["Crossbowman"] },
	{ "label": "All Axemen", "all": ["Axeman"] },
	{ "label": "All Macemen", "all": ["Maceman"] },

	// Classes of the units of a few civilizations, which is what usually needs banning.
	{ "label": "All Immortals", "all": ["Immortal"] },
	{ "label": "All Chariots", "all": ["Chariot"] },
	{ "label": "All Cataphracts", "all": ["Cataphract"] },
	{ "label": "All Gladiators", "all": ["Gladiator"] },
	{ "label": "All Camels", "all": ["Camel"] },
	{ "label": "All Auxiliaries", "all": ["Auxiliary"] },
	{ "label": "All Legionaries", "all": ["Legionary"] },
	{ "label": "All Siege Towers", "all": ["SiegeTower"] },
	{ "label": "All Rams", "all": ["Ram"] },
	{ "label": "All Bolt Shooters", "all": ["BoltShooter"] },
	{ "label": "All Stone Throwers", "all": ["StoneThrower"] },
	{ "label": "All Fire Ships", "all": ["Fireship"] }
];

/**
 * Whether a unit belongs to a class.
 *
 * @param {Object} unitClass - Entry of g_UnitClassList.
 * @param {Set<string>} classes - Classes of a unit template.
 * @returns {boolean}
 */
function unitMatchesClass(unitClass, classes)
{
	return unitClass.all.every(name => classes.has(name)) &&
		(unitClass.none || []).every(name => !classes.has(name));
}
