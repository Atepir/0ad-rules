/**
 * Offline verification of the UnitBanList helper of the "rules" mod.
 *
 * Loads the real list of unit templates shipped with 0 A.D. 0.28 (dumped from
 * binaries/data/mods/public/public.zip) and runs the mod's grouping logic with stubbed
 * engine globals, then checks the invariants the GUI and the simulation rely on.
 *
 * Usage: node tools/verify-unitbanlist.js <unit-templates.txt>
 */
"use strict";

const fs = require("fs");
const path = require("path");

const listFile = process.argv[2];
if (!listFile)
{
	console.error("usage: node verify-unitbanlist.js <unit-templates.txt>");
	process.exit(2);
}

// The dump contains full VFS paths; listFiles() returns them stripped of the directory
// prefix and of the extension.
const prefix = "simulation/templates/units/";
const paths = fs.readFileSync(listFile, "utf8")
	.split(/\r?\n/)
	.filter(line => line.endsWith(".xml") && line.startsWith(prefix))
	.map(line => line.slice(prefix.length, -".xml".length));

const civCodes = ["athen", "brit", "cart", "gaul", "han", "iber", "kush", "mace",
	"maur", "pers", "ptol", "rome", "sele", "spart"];

const civData = {};
for (const code of civCodes)
	civData[code] = { "Name": "Civ-" + code };

const source = fs.readFileSync(
	path.join(__dirname, "..", "rules", "gui", "gamesetup", "Pages", "GameSetupPage",
		"GameSettings", "Single", "Dropdowns", "UnitBanList.js"), "utf8");

const stubs = `
	var g_CivData = ${JSON.stringify(civData)};
	var g_ListFilesResult = ${JSON.stringify(paths)};
	function listFiles(directory, extension, recurse) {
		if (directory != "simulation/templates/units/" || extension != ".xml" || !recurse)
			throw new Error("UnitBanList requested an unexpected directory: " + directory);
		return g_ListFilesResult;
	}
	function warn(message) { console.log("WARN: " + message); }
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

const list = new Function(stubs + source + "\nreturn new UnitBanList();")();

const failures = [];
const check = (condition, message) =>
{
	if (!condition)
		failures.push(message);
};

check(paths.length > 500, "expected the full unit template list, got " + paths.length);
check(list.names.length == list.templates.length && list.names.length == list.tooltips.length,
	"names/templates/tooltips arrays have different lengths");
check(list.reverse.size == new Set(Array.from(list.reverse.keys())).size,
	"duplicate templates in the reverse map");

// Every entry must be findable through the reverse map, and grouping an entry's own
// templates must return exactly that entry.
let totalTemplates = 0;
for (let i = 0; i < list.names.length; ++i)
{
	check(list.templates[i].length > 0, `entry ${i} ('${list.names[i]}') disables nothing`);
	for (const template of list.templates[i])
		check(list.reverse.get(template) === i, `'${template}' does not map back to entry ${i}`);

	const group = list.groupTemplates(list.templates[i]);
	check(group.length == 1, `entry ${i} ('${list.names[i]}') split into ${group.length} groups`);
	check(group[0].name == list.names[i], `entry ${i} regroups as '${group[0].name}'`);

	check(list.tooltips[i].indexOf(list.templates[i][0]) != -1,
		`tooltip of entry ${i} doesn't mention its templates`);

	totalTemplates += list.templates[i].length;
}

// Only trainable units of playable civilizations may be listed, always templated on "{civ}".
for (const template of list.reverse.keys())
{
	check(/^units\/\{civ\}\/[^/]+$/.test(template), `unexpected template '${template}'`);

	const filename = template.slice("units/{civ}/".length);
	const owners = paths.filter(p => p.endsWith("/" + filename));
	check(owners.length > 0, `'${filename}' isn't a shipped template`);
	check(owners.some(p => civCodes.includes(p.split("/")[0])),
		`'${filename}' is only used by non-playable civilizations`);
}

// Scenario and cheat units aren't trainable, so they must not clutter the list.
for (const name of ["plane", "merc_thorakites", "samnite_swordsman", "viking_longship"])
	check(!list.reverse.has("units/" + name), `'${name}' should not be listed`);

// Sequential and sorted, so that the dropdown order is predictable.
const sorted = Array.from(list.names).sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 :
	a.toLowerCase() > b.toLowerCase() ? 1 : 0);
check(JSON.stringify(sorted) == JSON.stringify(list.names), "names are not sorted");

// Ranking variants must not appear as separate entries.
check(!list.names.some(name => / [ABE]$/.test(name)), "rank variants leaked into the names");
check(!list.names.some(name => / Packed$| Unpacked$/.test(name)), "packed variants leaked into the names");
check(!list.names.some(name => / [ABE] Trireme$/.test(name)), "trireme variants leaked into the names");

console.log("unit templates listed by the engine : " + paths.length);
console.log("disableable entries                 : " + list.names.length);
console.log("templates covered by those entries  : " + totalTemplates);
check(list.names.length > 100 && list.names.length < 300,
	"unexpected number of entries: " + list.names.length);
console.log("first 15 names                      : " + list.names.slice(0, 15).join(" | "));
console.log("examples with civ                  : " +
	list.names.filter(name => name.indexOf("(Civ-") != -1).slice(0, 3).join(" | "));
console.log("example tooltip                    : " + JSON.stringify(list.tooltips[0]));

if (failures.length)
{
	console.error("\nFAILED (" + failures.length + "):");
	for (const failure of failures.slice(0, 20))
		console.error("  - " + failure);
	process.exit(1);
}

console.log("\nAll invariant checks passed.");
