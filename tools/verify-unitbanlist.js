/**
 * Offline verification of UnitBanList and UnitClasses of the "rules" mod.
 *
 * Runs the mod's unit grouping and class matching against the real templates shipped with
 * 0 A.D. (tools/dump-unit-classes.py dumps the classes of every unit) with stubbed engine
 * globals, then checks the invariants the Match Setup and the simulation rely on - including
 * that a class covers exactly the units the game tags with it.
 *
 * Usage: node tools/verify-unitbanlist.js <unit-classes.txt>
 */
"use strict";

const fs = require("fs");
const path = require("path");

const dumpFile = process.argv[2];
if (!dumpFile) {
    console.error("usage: node verify-unitbanlist.js <unit-classes.txt>");
    process.exit(2);
}

const unitPrefix = "simulation/templates/units/";

// Every dumped line is a template and the classes it inherits, e.g.
// simulation/templates/units/athen/champion_infantry.xml<TAB>Champion Infantry Melee Soldier Spearman
const classesOf = new Map();
const dumpedPaths = [];
for (const line of fs.readFileSync(dumpFile, "utf8").split(/\r?\n/)) {
    if (!line.startsWith(unitPrefix) || !line.includes(".xml"))
        continue;

    const [full, classes = ""] = line.split("\t");
    classesOf.set(full.slice(0, -".xml".length), new Set(classes.split(" ").filter(value => value)));
    dumpedPaths.push(full.slice(unitPrefix.length, -".xml".length));
}

const civCodes = ["athen", "brit", "cart", "gaul", "han", "iber", "kush", "mace",
    "maur", "pers", "ptol", "rome", "sele", "spart"];

const civData = {};
for (const code of civCodes)
    civData[code] = { "Name": "Civ-" + code };

const dropdownDirectory = path.join(__dirname, "..", "gui", "gamesetup", "Pages",
    "GameSetupPage", "GameSettings", "Single", "Dropdowns");

const classesSource = fs.readFileSync(path.join(dropdownDirectory, "UnitClasses.js"), "utf8");
const banListSource = fs.readFileSync(path.join(dropdownDirectory, "UnitBanList.js"), "utf8");

/** The classes of a template, as the engine hands them to the GUI (paths without the ".xml"). */
const engineTemplates = {};
for (const [name, classes] of classesOf)
    engineTemplates[name.slice("simulation/templates/".length)] = Array.from(classes);

const stubs = `
	var g_CivData = ${JSON.stringify(civData)};
	var g_ListFilesResult = ${JSON.stringify(dumpedPaths)};
	var g_EngineTemplates = ${JSON.stringify(engineTemplates)};
	var g_Warnings = [];

	function listFiles(directory, extension, recurse) {
		if (directory != "simulation/templates/units/" || extension != ".xml" || !recurse)
			throw new Error("UnitBanList requested an unexpected directory: " + directory);
		return g_ListFilesResult;
	}

	var Engine = {
		GetTemplate(name) {
			if (!(name in g_EngineTemplates))
				throw new Error("unknown template: " + name);

			return {
				"Identity": {
					"VisibleClasses": {
						"@datatype": "tokens",
						"_string": g_EngineTemplates[name].join(" ")
					}
				}
			};
		}
	};

	function warn(message) { g_Warnings.push(message); }
	function translate(text) { return text; }
	function sprintf(format, args) {
		return format.replace(/%\\((\\w+)\\)s/g, (match, key) => args[key]);
	}
	function sortNameIgnoreCase(x, y) {
		const a = x.name.toLowerCase();
		const b = y.name.toLowerCase();
		return a < b ? -1 : a > b ? 1 : 0;
	}
`;

const built = new Function(stubs + classesSource + banListSource +
    "\nreturn { list: new UnitBanList(), warnings: g_Warnings };")();

const failures = [];
const check = (condition, message) => {
    if (!condition)
        failures.push(message);
};

const entries = built.list.entries;
const classEntries = entries.filter(entry => entry.isClass);
const unitEntries = entries.filter(entry => !entry.isClass);
const entryOf = name => entries.find(entry => entry.name == name);

/**
 * The templates of the unit a "{civ}" entry names, in every civilization the dump has for it.
 *
 * @param {string} template - e.g. "units/{civ}/champion_fanatic".
 * @returns {string[]} - e.g. ["units/gaul/champion_fanatic"].
 */
const instancesOf = template => {
    const filename = template.split("/").pop();
    return Array.from(classesOf.keys()).filter(name => name.endsWith("/" + filename));
};

/**
 * What a class must contain: the units the dump tags with it, whatever civilization has them,
 * independently of the mod's own matching code.
 *
 * A "{civ}" entry covers a unit as soon as one of its civilizations is tagged with the class.
 */
const civOf = name => name.slice(unitPrefix.length).split("/")[0];

const expectedMembers = predicate => Array.from(new Set(
    Array.from(classesOf)
        .filter(([name, classes]) => civCodes.includes(civOf(name)) && predicate(classes))
        .map(([name]) => "units/{civ}/" + name.split("/").pop())
)).sort();

const templatesOf = entry => entry.templates.slice().sort();
const equals = (a, b) => JSON.stringify(a) == JSON.stringify(b);

// ---------------------------------------------------------------- the shape of the list
check(dumpedPaths.length > 500, "expected the full unit template list, got " + dumpedPaths.length);
check(built.warnings.length == 0, "building the list must not warn: " + built.warnings);
check(classEntries.length > 20, "expected the unit classes, got " + classEntries.length);
check(unitEntries.length > 100, "expected the units, got " + unitEntries.length);
check(entries[0].isClass, "the classes must be listed before the units");

let lastClass = -1;
for (let index = 0; index < entries.length; ++index)
    if (entries[index].isClass)
        lastClass = index;
check(lastClass < entries.findIndex(entry => !entry.isClass),
    "all classes must be listed before the units");

// ------------------------------------------------------------------- every single entry
let coveredTemplates = 0;
const names = new Set();
for (const entry of entries) {
    check(entry.templates.length > 0, `entry '${entry.name}' disables nothing`);
    check(!!entry.tooltip, `entry '${entry.name}' has no tooltip`);
    check(new Set(entry.templates).size == entry.templates.length,
        `entry '${entry.name}' lists a template twice`);
    check(!names.has(entry.name), `two entries are named '${entry.name}'`);
    names.add(entry.name);

    for (const template of entry.templates) {
        check(template.startsWith("units/{civ}/"), `'${template}' is not a trainable template`);
        check(instancesOf(template).length > 0, `'${template}' is not among the dumped templates`);
        check(built.list.reverse.has(template), `'${template}' is not in the reverse map`);
        coveredTemplates += 1;
    }
}

// The classes must match the classes the game really tags the units with, which is what
// decides what a class disables.
check(equals(templatesOf(entryOf("All Champion Cavalry")),
    expectedMembers(classes => classes.has("Champion") && classes.has("Cavalry"))),
    "All Champion Cavalry must be the champion cavalry of the game, and nothing else");
check(equals(templatesOf(entryOf("All Champion Infantry")),
    expectedMembers(classes => classes.has("Champion") && classes.has("Infantry"))),
    "All Champion Infantry must be the champion infantry of the game, and nothing else");
check(equals(templatesOf(entryOf("All Immortals")),
    expectedMembers(classes => classes.has("Immortal"))),
    "All Immortals must be exactly the units the game tags as Immortals");
check(equals(templatesOf(entryOf("All Warships")),
    expectedMembers(classes => classes.has("Warship"))),
    "All Warships must be the warships of the game");
check(equals(templatesOf(entryOf("All Spearmen")),
    expectedMembers(classes => classes.has("Spearman"))),
    "All Spearmen must be every unit fighting with a spear");
check(equals(templatesOf(entryOf("All Citizen Soldier Infantry")),
    expectedMembers(classes => classes.has("Soldier") && classes.has("Infantry") &&
        !classes.has("Champion") && !classes.has("Hero") && !classes.has("Mercenary"))),
    "All Citizen Soldier Infantry must leave out champions, heroes and mercenaries");

// The cases this feature was asked for.
check(entryOf("All Champion Infantry").templates.includes("units/{civ}/champion_fanatic"),
    "the Naked Fanatic is champion infantry and must be covered by All Champion Infantry");
check(entryOf("All Champion Infantry").templates.includes("units/{civ}/champion_infantry"),
    "the Immortals' unit is champion infantry");
check(entryOf("All Champion Cavalry").templates.includes("units/{civ}/champion_chariot"),
    "the Britons' champion chariot is champion cavalry");
check(entryOf("All Immortals").templates.includes("units/{civ}/champion_infantry_archer_upgrade") &&
    !entryOf("All Immortals").templates.includes("units/{civ}/champion_infantry_archer"),
    "All Immortals must hold the Immortal archers and not the Persian champion archer");
check(entryOf("All Champion Cavalry").templates.includes("units/{civ}/champion_infantry") == false,
    "All Champion Cavalry must not contain champion infantry");

// Nothing may be lost by adding the classes: every class member must still be part of a unit
// entry, and every unit entry must still be reachable.
const unitTemplates = new Set();
for (const entry of unitEntries)
    for (const template of entry.templates)
        unitTemplates.add(template);

for (const entry of classEntries)
    for (const template of entry.templates)
        check(unitTemplates.has(template),
            `class '${entry.name}' covers '${template}', which no unit entry has`);

// ------------------------------------------------------------------- re-enabling entries
{
    const banned = entryOf("All Champion Cavalry").templates;
    const groups = built.list.reenableEntries(banned);

    check(groups.some(group => group.name == "All Champion Cavalry" && group.isClass),
        "a fully disabled class must be offered as one entry");
    check(groups.every(group => group.templates.every(template => banned.includes(template))),
        "re-enabling must never enable more than what is disabled");
    check(banned.every(template => groups.some(group => group.templates.includes(template))),
        "re-enabling must offer every disabled template");
    check(!groups.some(group => group.name == entryOf("All Champion Infantry").name),
        "a class that is still enabled must not be offered");
}

{
    // One rank of a unit: the class isn't fully disabled, so the unit is offered.
    const family = unitEntries.find(entry => entry.templates.includes("units/{civ}/champion_infantry"));
    const banned = family.templates.slice(0, 1);
    const groups = built.list.reenableEntries(banned);

    check(groups.length == 1 && !groups[0].isClass && equals(groups[0].templates, banned),
        "a partially disabled unit must be offered by its name: " + JSON.stringify(groups));
}

{
    // Something no entry knows, e.g. a template set by a scenario map.
    const groups = built.list.reenableEntries(["units/athen/champion_infantry"]);
    check(groups.length == 1 && equals(groups[0].templates, ["units/athen/champion_infantry"]),
        "an unknown template must be listed as it is: " + JSON.stringify(groups));
}

check(built.list.reenableEntries([]).length == 0, "nothing disabled must offer nothing");

const biggest = classEntries.slice().sort((a, b) => b.templates.length - a.templates.length);
console.log(`unit templates listed by the engine : ${dumpedPaths.length}`);
console.log(`unit entries                       : ${unitEntries.length}`);
console.log(`class entries                      : ${classEntries.length}`);
console.log(`class/unit pairs                   : ${coveredTemplates}`);
console.log("the classes asked for              : " + ["All Champion Cavalry", "All Champion Infantry", "All Immortals"]
    .map(name => `${name} (${entryOf(name).templates.length})`)
    .join(", "));
console.log("largest classes                    : " + biggest.slice(0, 5)
    .map(entry => `${entry.name} (${entry.templates.length})`)
    .join(", "));
console.log();

if (failures.length) {
    console.error("FAILED:");
    for (const failure of failures)
        console.error("  - " + failure);
    process.exit(1);
}

console.log("All invariant checks passed.");
