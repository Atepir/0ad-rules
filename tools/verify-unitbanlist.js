/**
 * Offline verification of the unit classes of the "rules" mod.
 *
 * Runs the mod's class matching against the real templates shipped with 0 A.D. (the classes of
 * every unit are dumped by tools/dump-unit-classes.py) with stubbed engine globals, then checks
 * the invariants the Match Setup and the simulation rely on: the three classes of the mod, the
 * templates each of them disables, and the rules that mark a class as disabled and enable it
 * again.
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
const CLASSES = ["Champion Cavalry", "Fanatics", "Immortals"];

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

/** The classes of a template, as the engine hands them to the GUI (paths without the ".xml"). */
const engineTemplates = {};
for (const [name, classes] of classesOf)
    engineTemplates[name.slice("simulation/templates/".length)] = Array.from(classes);

const dropdownDirectory = path.join(__dirname, "..", "gui", "gamesetup", "Pages",
    "GameSetupPage", "GameSettings", "Single", "Dropdowns");

const classesSource = fs.readFileSync(path.join(dropdownDirectory, "UnitClasses.js"), "utf8");
const banListSource = fs.readFileSync(path.join(dropdownDirectory, "UnitBanList.js"), "utf8");

const stubs = `
	var g_CivData = ${JSON.stringify(civData)};
	var g_ListFilesResult = ${JSON.stringify(dumpedPaths)};
	var g_EngineTemplates = ${JSON.stringify(engineTemplates)};
	var g_Warnings = [];
	// The list only reports when a maintainer turned the reporting on, so the run below sees
	// everything the game itself would not show a player.
	var g_RulesReport = true;

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
`;

const built = new Function(stubs + classesSource + banListSource +
    "\nreturn { list: new UnitBanList(), classes: g_UnitClassList, warnings: g_Warnings };")();

const failures = [];
const check = (condition, message) => {
    if (!condition)
        failures.push(message);
};

const entries = built.list.entries;
const entryOf = name => entries.find(entry => entry.name == name);
const templatesOf = entry => entry.templates.slice().sort();
const equals = (a, b) => JSON.stringify(a) == JSON.stringify(b);

/** The classes of a unit, in a specific civilization of the dump. */
const classesAt = template => classesOf.get("simulation/templates/" + template);

/** The trainable units of the game, as the "{civ}" templates the entries are made of. */
const trainable = new Set(Array.from(classesOf.keys())
    .filter(name => civCodes.includes(name.slice(unitPrefix.length).split("/")[0]))
    .map(name => "units/{civ}/" + name.split("/").pop()));

/** The "{civ}" form of a template path, as the mod stores and compares them. */
const canonical = template => {
    const parts = template.split("/");
    return parts.length == 3 && civCodes.includes(parts[1]) ?
        parts[0] + "/{civ}/" + parts[2] :
        template;
};

/**
 * What a class must contain: the units of the dump it matches. A file that every playable
 * civilization has is one "{civ}" template, the others are listed per civilization, so that a
 * class can't disable a unit another civilization shares the file with.
 */
const expectedMembers = predicate => {
    const matching = Array.from(classesOf)
        .filter(([name]) => civCodes.includes(name.slice(unitPrefix.length).split("/")[0]))
        .filter(([name, classes]) => predicate(classes, name.split("/").pop()))
        .map(([name]) => name.slice(unitPrefix.length).split("/"));

    const civilizations = new Map();
    for (const [civ, filename] of matching) {
        if (!civilizations.has(filename))
            civilizations.set(filename, new Set());
        civilizations.get(filename).add(civ);
    }

    const templates = [];
    for (const [filename, civs] of civilizations)
        if (civs.size == civCodes.length)
            templates.push("units/{civ}/" + filename);
        else
            for (const civ of civs)
                templates.push("units/" + civ + "/" + filename);

    return templates.sort();
};

// ------------------------------------------------------------------- the shape of the list
check(dumpedPaths.length > 500, "expected the full unit template list, got " + dumpedPaths.length);
check(built.warnings.length == 0, "building the list must not warn: " + built.warnings);
check(equals(entries.map(entry => entry.name), CLASSES),
    "the mod offers exactly its three classes: " + JSON.stringify(entries.map(entry => entry.name)));

for (const entry of entries) {
    check(entry.templates.length > 0, `entry '${entry.name}' disables nothing`);
    check(!!entry.tooltip, `entry '${entry.name}' has no tooltip`);
    check(new Set(entry.templates).size == entry.templates.length,
        `entry '${entry.name}' lists a template twice`);

    for (const template of entry.templates) {
        const parts = template.split("/");
        check(parts.length == 3 && parts[0] == "units", `'${template}' is not a unit template`);
        check(parts[1] == "{civ}" || civCodes.includes(parts[1]),
            `'${template}' is not tied to a civilization or the "{civ}" placeholder`);
        check(trainable.has(canonical(template)),
            `'${template}' is not a unit of a playable civilization`);
        check(built.list.reverse.has(canonical(template)),
            `'${template}' is not in the reverse map`);
    }
}

// ------------------------------------------------- the classes must match the game data
check(equals(templatesOf(entryOf("Champion Cavalry")),
    expectedMembers(classes => classes.has("Champion") && classes.has("Cavalry"))),
    "Champion Cavalry must be the champion cavalry of the game, and nothing else");
check(equals(templatesOf(entryOf("Immortals")),
    expectedMembers(classes => classes.has("Immortal"))),
    "Immortals must be exactly the units the game tags as Immortals");
check(equals(templatesOf(entryOf("Fanatics")),
    expectedMembers((classes, filename) => filename == "champion_fanatic")),
    "Fanatics must be the units built from champion_fanatic");

check(entryOf("Champion Cavalry").templates.some(template => template.endsWith("/champion_cavalry")),
    "the champion cavalry of the civilizations must be in Champion Cavalry");
check(entryOf("Champion Cavalry").templates.some(template => template.endsWith("/champion_chariot")),
    "the Britons' champion chariot is champion cavalry");
check(!entryOf("Champion Cavalry").templates.some(template => template.endsWith("/champion_infantry")),
    "Champion Cavalry must not contain champion infantry");
check(entryOf("Fanatics").templates.some(template => template.endsWith("/champion_fanatic")),
    "the Gauls' Naked Fanatic must be in Fanatics");
check(entryOf("Immortals").templates.some(template => template.endsWith("/champion_infantry")),
    "the Immortals' unit is champion infantry");
check(entryOf("Immortals").templates.some(template =>
    template.endsWith("/champion_infantry_archer_upgrade")),
    "All Immortals must hold the Immortal archers");
check(!entryOf("Immortals").templates.some(template =>
    template.endsWith("/champion_infantry_archer")),
    "Immortals must not contain the Persian champion archer");
check(entryOf("Immortals").templates.includes("units/pers/champion_infantry"),
    "the Persian Immortals' champion_infantry is the unit other civilizations share the file " +
    "with, so it must be disabled for the Persians only, not through \"{civ}\": " +
    JSON.stringify(entryOf("Immortals").templates));

{
    // A unit the mod disables twice, or in two classes, would be confusing to enable again.
    const seen = new Map();
    for (const entry of entries)
        for (const template of entry.templates) {
            check(!seen.has(template),
                `'${template}' is in both '${seen.get(template)}' and '${entry.name}'`);
            seen.set(template, entry.name);
        }
}

// --------------------------------------------------- what the dropdown marks as disabled
/**
 * What the Disable dropdown colors and the Enable dropdown offers, for a disabled template list.
 */
const statesFor = templates => {
    const disabled = built.list.canonicalTemplates(templates);

    return {
        "marked": entries
            .filter(entry => built.list.disabledState(entry, disabled) == "all")
            .map(entry => entry.name),
        "stateOf": name => built.list.disabledState(entryOf(name), disabled)
    };
};

for (const entry of entries) {
    const { marked, stateOf } = statesFor(entry.templates);

    check(equals(marked, [entry.name]),
        `disabling '${entry.name}' must mark only it: ` + JSON.stringify(marked));
    for (const other of entries)
        if (other != entry)
            check(stateOf(other.name) == "none",
                `disabling '${entry.name}' must not mark '${other.name}'`);
}

{
    // The three classes share no unit, so partly disabled is what a scenario map or a setting of
    // an older version of this mod produces, not a normal selection.
    const { marked, stateOf } = statesFor(["units/{civ}/champion_cavalry"]);

    check(marked.length == 0, "one unit does not disable a class: " + JSON.stringify(marked));
    check(stateOf("Champion Cavalry") == "partly", "one of its units disables it partly");
    check(stateOf("Immortals") == "none", "a unit of another class doesn't touch it");
}

// ------------------------------------------------------------------- re-enabling entries
/**
 * What enabling every offered group removes, which has to be exactly what was disabled.
 */
const reenable = templates => {
    const groups = built.list.reenableEntries(templates);

    for (const group of groups) {
        check(!!group.name, "a group without a name: " + JSON.stringify(group));
        check(group.templates.length > 0, `group '${group.name}' offers nothing`);
        check(group.disabled.length > 0, `group '${group.name}' removes nothing`);
        check(group.disabled.every(template => templates.includes(template)),
            `group '${group.name}' removes a template that is not disabled`);
    }

    const removed = [].concat(...groups.map(group => group.disabled)).sort();
    check(equals(removed, templates.slice().sort()),
        `enabling every group must remove exactly what was disabled: ${JSON.stringify(removed)}`);

    return groups;
};

for (const entry of entries) {
    const groups = reenable(entry.templates);
    const full = groups.find(group => group.name == entry.name);

    check(groups.length == 1 && !!full,
        `'${entry.name}' must be offered as the only entry: ` +
        JSON.stringify(groups.map(group => group.name)));
    check(full && equals(full.templates.slice().sort(), entry.templates.slice().sort()),
        `'${entry.name}' must offer exactly the templates it disables`);
}

{
    // A disabled class that a scenario map or an older version of this mod only cut into.
    const partial = ["units/{civ}/champion_infantry"];
    const groups = built.list.reenableEntries(partial);

    check(groups.length == 1 && equals(groups[0].templates, partial),
        "a partially disabled class must be offered with the templates it holds: " +
        JSON.stringify(groups));

    const suffix = " (partly disabled)";
    check(groups[0].name.endsWith(suffix) &&
        CLASSES.some(label => groups[0].name == label + suffix),
        "a partial group must be named after the class it belongs to: " + groups[0].name);
}

{
    // A setting of a version that stored the civilizations as "{civ}": the class it belongs to
    // must still be offered, and enabling it must remove the template as the setting stores it.
    const legacy = ["units/{civ}/champion_cavalry"];
    const groups = reenable(legacy);

    const suffix = " (partly disabled)";
    check(groups.length == 1 && groups[0].name == "Champion Cavalry" + suffix,
        "a legacy \"{civ}\" template must be offered by its class: " +
        JSON.stringify(groups.map(group => group.name)));
    check(groups[0] && equals(groups[0].disabled, legacy),
        "a legacy group must offer the template as the setting stores it");
}

{
    const groups = built.list.reenableEntries([]);
    check(groups.length == 0, "nothing disabled must offer nothing");
}

const memberships = entries.reduce((sum, entry) => sum + entry.templates.length, 0);
console.log(`unit templates listed by the engine : ${dumpedPaths.length}`);
console.log(`trainable "{civ}" templates        : ${trainable.size}`);
console.log(`classes                            : ` + entries
    .map(entry => `${entry.name} (${entry.templates.length})`)
    .join(", "));
console.log(`templates disabled in total        : ${memberships}`);
console.log();

if (failures.length) {
    console.error("FAILED:");
    for (const failure of failures)
        console.error("  - " + failure);
    process.exit(1);
}

console.log("All invariant checks passed.");
