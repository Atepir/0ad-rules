/**
 * Offline verification of UnitBanList and UnitClasses of the "rules" mod.
 *
 * Runs the mod's class matching against the real templates shipped with 0 A.D. (the classes of
 * every unit are dumped by tools/dump-unit-classes.py) with stubbed engine globals, then checks
 * the invariants the Match Setup and the simulation rely on - above all that the classes cover
 * every trainable unit, since the settings only offer classes.
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
 * What a class must contain: the units the dump tags with it. A file that every playable
 * civilization has is one "{civ}" template, the others are listed per civilization, so that a
 * class can't disable a unit another civilization shares the file with.
 */
const expectedMembers = predicate => {
    const matching = Array.from(classesOf)
        .filter(([name, classes]) => civCodes.includes(name.slice(unitPrefix.length).split("/")[0]) &&
            predicate(classes))
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

const templatesOf = entry => entry.templates.slice().sort();
const equals = (a, b) => JSON.stringify(a) == JSON.stringify(b);

// ------------------------------------------------------------------- the shape of the list
check(dumpedPaths.length > 500, "expected the full unit template list, got " + dumpedPaths.length);
check(built.warnings.length == 0, "building the list must not warn: " + built.warnings);
check(built.classes.length > 40, "expected the class table, got " + built.classes.length);
check(entries.length > 40, "expected the class entries, got " + entries.length);
check(entries.length <= built.classes.length, "no class may produce two entries");

// Only classes are offered, and every class that matches a unit is offered.
const labels = new Set(built.classes.map(unitClass => unitClass.label));
const missing = built.classes.map(unitClass => unitClass.label).filter(label => !entryOf(label));
check(missing.length == 0, "classes without an entry: " + missing);
for (const entry of entries)
    check(labels.has(entry.name), `'${entry.name}' is not a class of UnitClasses.js`);

// ---------------------------------------------------------------------- every single entry
for (const entry of entries) {
    check(entry.templates.length > 0, `entry '${entry.name}' disables nothing`);
    check(!!entry.tooltip, `entry '${entry.name}' has no tooltip`);
    check(new Set(entry.templates).size == entry.templates.length,
        `entry '${entry.name}' lists a template twice`);

    for (const template of entry.templates) {
        const parts = template.split("/");
        check(parts.length == 3 && parts[0] == "units", `'${template}' is not a unit template`);
        check(parts[1] == "{civ}" || civCodes.includes(parts[1]),
            `'${template}' is not tied to a civilization or a placeholder`);
        check(trainable.has(canonical(template)), `'${template}' is not a unit of a playable civilization`);
        check(built.list.reverse.has(canonical(template)), `'${template}' is not in the reverse map`);
    }
}

// The settings only offer classes, so a unit that no class covers could not be disabled at all.
const covered = new Set();
for (const entry of entries)
    for (const template of entry.templates)
        covered.add(canonical(template));

const uncovered = Array.from(trainable).filter(template => !covered.has(template)).sort();
check(uncovered.length == 0, "units no class covers, hence un-bannable: " + uncovered);
check(covered.size == trainable.size,
    `the classes cover ${covered.size} templates, the game has ${trainable.size}`);

// ------------------------------------------------------- the classes must match the game data
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
check(equals(templatesOf(entryOf("All Catafalques")),
    expectedMembers(classes => classes.has("Relic"))),
    "All Catafalques must be the units the game tags as relics, hence the catafalques");
check(equals(templatesOf(entryOf("All War Dogs")),
    expectedMembers(classes => classes.has("Dog"))),
    "All War Dogs must be the war dogs of the game");

// The cases this feature was asked for.
check(entryOf("All Champion Cavalry").templates.includes("units/{civ}/champion_cavalry") ||
    entryOf("All Champion Cavalry").templates.some(template => template.endsWith("/champion_cavalry")),
    "the champion cavalry of the civilizations must be in All Champion Cavalry");
check(entryOf("All Champion Infantry").templates.some(template => template.endsWith("/champion_fanatic")),
    "the Naked Fanatic is champion infantry and must be covered by All Champion Infantry");
check(entryOf("All Champion Infantry").templates.some(template => template.endsWith("/champion_infantry")),
    "the Immortals' unit is champion infantry");
check(entryOf("All Champion Cavalry").templates.some(template => template.endsWith("/champion_chariot")),
    "the Britons' champion chariot is champion cavalry");
check(entryOf("All Immortals").templates.includes("units/{civ}/champion_infantry_archer_upgrade") ||
    entryOf("All Immortals").templates.some(template => template.endsWith("/champion_infantry_archer_upgrade")),
    "All Immortals must hold the Immortal archers");
check(!entryOf("All Immortals").templates.includes("units/{civ}/champion_infantry_archer"),
    "All Immortals must not contain the Persian champion archer");
check(!entryOf("All Immortals").templates.includes("units/{civ}/champion_infantry") &&
    entryOf("All Immortals").templates.includes("units/pers/champion_infantry"),
    "the Persian Immortals' champion_infantry is the unit other civilizations share the file " +
    "with, so All Immortals must disable it for the Persians only, not through \"{civ}\": " +
    JSON.stringify(entryOf("All Immortals").templates));
check(entryOf("All Champion Cavalry").templates.includes("units/{civ}/champion_infantry") == false,
    "All Champion Cavalry must not contain champion infantry");

// ---------------------------------------------------- the classes must be disjoint where the
// game's own classes are, so that a host can rely on them.
check(classesAt("units/athen/champion_infantry").has("Champion") &&
    classesAt("units/athen/champion_infantry").has("Infantry") &&
    !classesAt("units/athen/champion_infantry").has("Cavalry"),
    "champion infantry must not be cavalry in the game data this check runs against");

// --------------------------------------------------- what the dropdown marks as disabled
/**
 * What the Disable dropdown colors: the state of every entry for a disabled template list.
 */
const statesFor = templates => {
    const disabled = built.list.canonicalTemplates(templates);

    return {
        "marked": entries
            .filter(entry => built.list.disabledState(entry, disabled) == "all")
            .map(entry => entry.name)
            .sort(),
        "stateOf": name => built.list.disabledState(entryOf(name), disabled),
        "shared": entries.filter(entry => entry.templates
            .some(template => disabled.has(canonical(template)))).length
    };
};

{
    // The champion cavalry of a civilization is also one of its champions, so classes always
    // overlap: only the class the host disabled may be marked, not every class it cuts into.
    const { marked, stateOf, shared } = statesFor(entryOf("All Champion Cavalry").templates);

    check(equals(marked, ["All Cataphracts", "All Champion Cavalry"]),
        "only the classes the host disabled are marked, and the cataphracts they cover: " +
        JSON.stringify(marked));
    check(stateOf("All Champions") == "partly",
        "the champion cavalry also partly disables the champions it belongs to");
    check(stateOf("All Champion Infantry") == "none",
        "the champion infantry shares no unit with the champion cavalry");
    check(stateOf("All Fishing Boats") == "none",
        "a class that shares nothing with the disabled one is not marked at all");
    check(shared > marked.length,
        `the classes sharing a template outnumber the marked ones (${shared} share, ` +
        `${marked.length} marked), which is what the marker must not report`);
    check(built.list.disabledCount(entryOf("All Champion Cavalry"),
        built.list.canonicalTemplates(entryOf("All Champion Cavalry").templates)) ==
        entryOf("All Champion Cavalry").templates.length,
        "a disabled class counts all of its own templates as disabled");
}

{
    const { marked, stateOf } = statesFor(entryOf("All Immortals").templates);

    check(equals(marked, ["All Immortals"]),
        "the Immortals mark exactly the class that was disabled: " + JSON.stringify(marked));
    check(stateOf("All Champion Infantry") == "partly",
        "the Persian champion infantry is part of All Champion Infantry, hence partly disabled");
}

{
    const { marked } = statesFor([]);
    check(marked.length == 0, "nothing disabled marks nothing");
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

{
    const banned = entryOf("All Champion Cavalry").templates;
    const groups = reenable(banned);
    const full = groups.find(group => group.name == "All Champion Cavalry");

    check(!!full, "a fully disabled class must be offered as one entry");
    check(full && equals(full.templates.slice().sort(), banned.slice().sort()),
        "a fully disabled class must offer exactly the templates it disables");
    check(!groups.some(group => group.name == entryOf("All Champion Infantry").name),
        "a class that is still enabled must not be offered");
}

{
    // One template of a class with several, as a scenario map or an older version of this mod
    // sets it: the class is not fully disabled, so the templates are offered as a partial group.
    const partial = ["units/{civ}/champion_infantry"];
    const groups = built.list.reenableEntries(partial);

    check(groups.length == 1 && equals(groups[0].templates, partial),
        "a partially disabled class must be offered with the templates it holds: " +
        JSON.stringify(groups));

    const suffix = " (partly disabled)";
    check(groups[0].name.endsWith(suffix) &&
        built.classes.some(unitClass => groups[0].name == unitClass.label + suffix),
        "a partial group must be named after the class it belongs to: " + groups[0].name);
}

{
    const groups = built.list.reenableEntries([]);
    check(groups.length == 0, "nothing disabled must offer nothing");
}

{
    // A setting of a version of this mod that stored the civilizations as "{civ}": the class it
    // belongs to must still be offered, and enabling it must remove the template as it is
    // stored, or the setting would keep a template the host can't get rid of.
    const legacy = ["units/{civ}/champion_cavalry"];
    const groups = reenable(legacy);

    /** A group name is the class it belongs to, optionally marked as partly disabled. */
    const isClassName = name => built.classes.some(unitClass =>
        name == unitClass.label || name == unitClass.label + " (partly disabled)");

    check(groups.length == 1 && isClassName(groups[0].name),
        "a legacy \"{civ}\" template must be offered by class, not as a raw template: " +
        JSON.stringify(groups.map(group => group.name)));
    check(groups[0] && groups[0].disabled.length == 1 && groups[0].disabled[0] == legacy[0],
        "a legacy group must offer the template as the setting stores it");
}

const biggest = entries.slice().sort((a, b) => b.templates.length - a.templates.length);
console.log(`unit templates listed by the engine : ${dumpedPaths.length}`);
console.log(`trainable "{civ}" templates        : ${trainable.size}`);
console.log(`class entries                      : ${entries.length}`);
console.log(`covered by the classes             : ${covered.size} (uncovered: ${uncovered.length})`);
console.log("the classes asked for              : " + ["All Champion Cavalry", "All Champion Infantry", "All Immortals"]
    .map(name => `${name} (${entryOf(name).templates.length})`)
    .join(", "));
console.log("disabling All Champion Cavalry     : " +
    JSON.stringify(statesFor(entryOf("All Champion Cavalry").templates).marked) +
    ` marked, ${statesFor(entryOf("All Champion Cavalry").templates).shared} share a template`);
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
