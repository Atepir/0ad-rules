/**
 * The list of units and unit classes the host can disable in the Match Setup.
 *
 * Unit templates are grouped into "families" so that the host disables a unit instead of a
 * specific template:
 *  - the basic (a), advanced (b) and elite (e) ranks of a unit are one entry;
 *  - packed/unpacked and ship-garrison ("cavalry_axeman_a_trireme") variants are one entry;
 *  - the civilization folder of the template path is replaced by the "{civ}" placeholder, so
 *    that one entry disables the unit for every civilization at once. It is expanded by the
 *    simulation for each player (see Player.prototype.OnGlobalInitGame).
 *
 * The classes of UnitClasses.js are listed first, one entry each, and disable every unit that
 * carries the classes of the entry ("Champion Cavalry" covers the champion cavalry of every
 * civilization, whatever their weapon and rank). The individual units follow, so that a
 * single unit (the "Naked Fanatic" of the Gauls, for instance) can still be picked.
 *
 * Only trainable units of playable civilizations are listed.
 */
class UnitBanList {
	constructor() {
		/**
		 * Directory containing the unit templates.
		 */
		this.Directory = "simulation/templates/units/";

		/**
		 * Suffixes that mark a variant of a unit rather than a different unit.
		 *
		 * The rank of a unit (basic, advanced, elite) is either the last part of the name or is
		 * followed by the variant, as in "cavalry_axeman_a_trireme".
		 */
		this.VariantSuffixes = [
			/_(?:un)?packed$/,
			/_[abe]_trireme$/,
			/_[abe]$/
		];

		/**
		 * Maximum number of units shown in the tooltip of a class.
		 */
		this.MaxTooltipUnits = 6;

		/**
		 * Maximum number of templates shown in the tooltip of a unit.
		 */
		this.MaxTooltipTemplates = 6;

		/**
		 * Everything the host can disable, the unit classes of UnitClasses.js first.
		 *
		 * @type {{name: string, templates: string[], tooltip: string, isClass: boolean}[]}
		 */
		this.entries = [];

		/**
		 * Name of the unit entry a template belongs to, if any, for the tooltips of the classes.
		 */
		this.unitNames = new Map();

		/**
		 * Maps a disabled template to the index of the entry describing it, preferring the unit
		 * entries over the class ones, so that re-enabling names the unit.
		 */
		this.reverse = new Map();

		this.build();
	}

	/**
	 * Fills this.entries and the lookup maps.
	 */
	build() {
		const civCodes = new Set(Object.keys(g_CivData));
		const families = new Map();
		const templates = [];

		for (const path of listFiles(this.Directory, ".xml", true)) {
			// By splitting on both separators the list also works if the VFS returns
			// platform-dependent paths.
			const parts = path.split(/[\\/]/);
			if (parts.length != 2) {
				// Templates in the units directory itself ("units/plane", "units/merc_thorakites", ...)
				// aren't tied to a civilization and aren't trainable, so disabling them would
				// have no effect.
				if (parts.length > 2)
					warn("rules: ignoring unexpected unit template '" + path + "'.");
				continue;
			}

			const [civ, filename] = parts;

			// Units of playable civilizations only, the others can't appear in a match.
			if (!civCodes.has(civ))
				continue;

			const key = this.familyKey(filename);
			if (!families.has(key))
				families.set(key, { "civs": new Set(), "templates": new Set() });

			const family = families.get(key);
			family.civs.add(civ);
			family.templates.add("units/{civ}/" + filename);

			templates.push({
				"template": "units/{civ}/" + filename,
				"classes": this.templateClasses("units/" + civ + "/" + filename)
			});
		}

		const unitEntries = Array.from(families, ([key, family]) => {
			// Sorting the names is locale-dependent but only affects the local GUI,
			// the disabled templates themselves are sorted deterministically.
			const civs = Array.from(family.civs).sort();
			return {
				"name": this.makeName(key, civs),
				"templates": Array.from(family.templates).sort(),
				"isClass": false
			};
		})
			.sort(sortNameIgnoreCase);

		for (const entry of unitEntries) {
			entry.tooltip = this.makeTooltip(entry.templates);
			for (const template of entry.templates)
				this.unitNames.set(template, entry.name);
		}

		this.entries = g_UnitClassList
			.map(unitClass => this.makeClassEntry(unitClass, templates))
			.filter(entry => entry)
			.concat(unitEntries);

		// The unit entries win the lookup, so that re-enabling names the unit and not the class.
		for (const isClass of [false, true])
			for (let index = 0; index < this.entries.length; ++index)
				if (this.entries[index].isClass === isClass)
					for (const template of this.entries[index].templates)
						if (!this.reverse.has(template))
							this.reverse.set(template, index);
	}

	/**
	 * The classes of a unit template, as the game's own Reference page reads them.
	 *
	 * A template of a game version that tags units differently has no classes here, which only
	 * keeps it out of the classes; its unit entry still disables it, hence the warning.
	 *
	 * @param {string} path - Template path without the ".xml" extension.
	 * @returns {Set<string>}
	 */
	templateClasses(path) {
		let visibleClasses;
		try {
			const template = Engine.GetTemplate(path);
			visibleClasses = template && template.Identity && template.Identity.VisibleClasses;
		}
		catch (error) {
			warn("rules: couldn't read the template '" + path + "': " + error);
			return new Set();
		}

		if (!visibleClasses || !visibleClasses._string)
			return new Set();

		return new Set(visibleClasses._string.split(" ").filter(name => name));
	}

	/**
	 * @param {Object} unitClass - Entry of g_UnitClassList.
	 * @param {{template: string, classes: Set<string>}[]} templates
	 * @returns {Object|undefined} The entry, or undefined when the class matches no unit.
	 */
	makeClassEntry(unitClass, templates) {
		// Several civilizations can have a unit of the same name, and they all end up as the
		// same "{civ}" template, hence the set.
		const matching = Array.from(new Set(templates
			.filter(unit => unitMatchesClass(unitClass, unit.classes))
			.map(unit => unit.template)))
			.sort();

		if (!matching.length) {
			warn("rules: the '" + unitClass.label + "' unit class matches no unit.");
			return undefined;
		}

		return {
			"name": translate(unitClass.label),
			"templates": matching,
			"tooltip": this.makeClassTooltip(matching),
			"isClass": true
		};
	}

	/**
	 * The key that groups all variants of the same unit.
	 *
	 * @param {string} filename
	 * @returns {string}
	 */
	familyKey(filename) {
		let key = filename;
		for (const suffix of this.VariantSuffixes)
			key = key.replace(suffix, "");

		return key;
	}

	/**
	 * @param {string} key
	 * @param {string[]} civs - civilizations that have this unit.
	 * @returns {string}
	 */
	makeName(key, civs) {
		const name = key.split("_")
			.map(word => word.charAt(0).toUpperCase() + word.substr(1))
			.join(" ");

		// Civ-specific units (heroes, unique champions, ...) are only worth naming if the
		// civilization that can train them is mentioned.
		if (civs.length == 1 && g_CivData[civs[0]])
			return sprintf(translate("%(unit)s (%(civ)s)"), {
				"unit": name,
				"civ": g_CivData[civs[0]].Name
			});

		return name;
	}

	/**
	 * @param {string[]} templates
	 * @returns {string}
	 */
	makeTooltip(templates) {
		const shown = templates.slice(0, this.MaxTooltipTemplates);
		let tooltip = sprintf(translate("Disables the following templates:\n%(templates)s"), {
			"templates": shown.join("\n")
		});

		if (shown.length < templates.length)
			tooltip += "\n" + sprintf(translate("... and %(count)s more."), {
				"count": templates.length - shown.length
			});

		return tooltip;
	}

	/**
	 * A class covers dozens of templates ("Champion Infantry" 50 of them, in 14 civilizations),
	 * so its tooltip lists the units it disables instead of the templates.
	 *
	 * @param {string[]} templates
	 * @returns {string}
	 */
	makeClassTooltip(templates) {
		const names = [];
		for (const template of templates) {
			const name = this.unitNames.get(template);
			if (name && names.indexOf(name) == -1)
				names.push(name);
		}

		const shown = names.slice(0, this.MaxTooltipUnits);
		let tooltip = sprintf(translate("Disables the following units:\n%(units)s"), {
			"units": shown.join("\n")
		});

		if (shown.length < names.length)
			tooltip += "\n" + sprintf(translate("... and %(count)s more."), {
				"count": names.length - shown.length
			});

		return tooltip;
	}

	/**
	 * The entries that undo the given disabled templates.
	 *
	 * An entry is listed when all of its templates are disabled, so that a class, or the three
	 * ranks of a unit, are enabled again with one click. Templates that no entry covers
	 * completely - set by a scenario map, or by an older version of this mod - are grouped by
	 * the unit they belong to, or listed as they are.
	 *
	 * @param {string[]} templates
	 * @returns {{name: string, templates: string[], isClass: boolean}[]}
	 */
	reenableEntries(templates) {
		const disabled = new Set(templates);
		const entries = this.entries.filter(entry => entry.templates.every(template => disabled.has(template)));

		const covered = new Set();
		for (const entry of entries)
			for (const template of entry.templates)
				covered.add(template);

		const groups = new Map();
		for (const template of templates) {
			if (covered.has(template))
				continue;

			const index = this.reverse.get(template);
			const name = index === undefined ? template : this.entries[index].name;

			if (!groups.has(name))
				groups.set(name, { "name": name, "templates": [], "isClass": false });

			groups.get(name).templates.push(template);
		}

		return entries.concat(Array.from(groups.values()));
	}
}

/**
 * Shared by the game setting controls, so that the template list is only built once.
 */
var g_UnitBanList;

function getUnitBanList() {
	if (!g_UnitBanList)
		g_UnitBanList = new UnitBanList();

	return g_UnitBanList;
}
