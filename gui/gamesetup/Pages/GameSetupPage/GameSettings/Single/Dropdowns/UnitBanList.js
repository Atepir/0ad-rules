/**
 * The list of units the host can disable in the Match Setup.
 *
 * Unit templates are grouped into "families" so that the host disables a unit instead of a
 * specific template:
 *  - the basic (a), advanced (b) and elite (e) ranks of a unit are one entry;
 *  - packed/unpacked and ship-garrison ("cavalry_axeman_a_trireme") variants are one entry;
 *  - the civilization folder of the template path is replaced by the "{civ}" placeholder, so
 *    that one entry disables the unit for every civilization at once. It is expanded by the
 *    simulation for each player (see Player.prototype.OnGlobalInitGame).
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
		 * Maximum number of templates shown in a tooltip.
		 */
		this.MaxTooltipTemplates = 6;

		/**
		 * Display names of the entries, sorted case-insensitively.
		 */
		this.names = [];

		/**
		 * Templates disabled by the entry with the same index.
		 *
		 * @type {string[][]}
		 */
		this.templates = [];

		/**
		 * Tooltips of the entries.
		 */
		this.tooltips = [];

		/**
		 * Maps a disabled template to the index of the entry that disables it.
		 */
		this.reverse = new Map();

		this.build();
	}

	/**
	 * Fills this.names, this.templates and this.tooltips.
	 */
	build() {
		const civCodes = new Set(Object.keys(g_CivData));
		const families = new Map();

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
		}

		const entries = Array.from(families, ([key, family]) => {
			// Sorting the names is locale-dependent but only affects the local GUI,
			// the disabled templates themselves are sorted deterministically.
			const civs = Array.from(family.civs).sort();
			return {
				"name": this.makeName(key, civs),
				"templates": Array.from(family.templates).sort()
			};
		})
			.sort(sortNameIgnoreCase);

		for (const entry of entries) {
			this.names.push(entry.name);
			this.templates.push(entry.templates);
			this.tooltips.push(this.makeTooltip(entry.templates));

			for (const template of entry.templates)
				this.reverse.set(template, this.names.length - 1);
		}
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
	 * Groups disabled templates by the entry describing them, so that e.g. the three ranks of a
	 * unit are re-enabled with one click.
	 *
	 * Templates that aren't part of any entry (e.g. set by a scenario map) are listed as-is.
	 *
	 * @param {string[]} templates
	 * @returns {{name: string, templates: string[]}[]}
	 */
	groupTemplates(templates) {
		const groups = new Map();

		for (const template of templates) {
			const index = this.reverse.get(template);
			const name = index === undefined ? template : this.names[index];

			if (!groups.has(name))
				groups.set(name, []);

			groups.get(name).push(template);
		}

		return Array.from(groups, ([name, groupTemplates]) =>
			({ "name": name, "templates": groupTemplates }));
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
