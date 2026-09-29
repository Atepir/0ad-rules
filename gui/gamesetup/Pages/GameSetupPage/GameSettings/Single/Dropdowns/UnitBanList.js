/**
 * The unit classes the host can disable in the Match Setup.
 *
 * The entries are the classes of UnitClasses.js. A class disables every unit that carries the
 * classes of the entry, for every civilization, whatever its rank and weapon, so "All Champion
 * Infantry" covers the champion infantry of the game in one entry instead of 34.
 *
 * Only classes are listed: a single unit that is broken in a release is disabled through the
 * class it belongs to (the Gauls' Naked Fanatic through "All Champion Infantry"), which keeps
 * the list short and the setting readable. A unit that no class covers would be impossible to
 * disable, so that is reported in the game log.
 *
 * A unit template is stored as "units/{civ}/<file>", so that one entry disables the unit for
 * every civilization at once; the placeholder is expanded by the simulation for each player
 * (see Player.prototype.OnGlobalInitGame). A file that only some civilizations have - or that is
 * a different unit for some of them, like the Persian Immortals' champion_infantry - is stored
 * with those civilizations spelled out, so that disabling it can't disable an unrelated unit of
 * another civilization.
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
		 * Maximum number of templates listed in a tooltip.
		 */
		this.MaxTooltipTemplates = 6;

		/**
		 * Everything the host can disable, in the order of g_UnitClassList.
		 *
		 * @type {{name: string, templates: string[], tooltip: string}[]}
		 */
		this.entries = [];

		/**
		 * Maps a template to the index of the entry that covers it.
		 */
		this.reverse = new Map();

		/**
		 * Codes of the playable civilizations.
		 *
		 * @type {Set<string>}
		 */
		this.civCodes = new Set();

		/**
		 * Templates of the loaded game that at least one class covers.
		 *
		 * @type {Set<string>}
		 */
		this.covered = new Set();

		this.build();
	}

	/**
	 * Fills this.entries and this.reverse.
	 */
	build() {
		this.civCodes = new Set(Object.keys(g_CivData));
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
			if (!this.civCodes.has(civ))
				continue;

			templates.push({
				"template": "units/" + civ + "/" + filename,
				"filename": filename,
				"civ": civ,
				"classes": this.templateClasses("units/" + civ + "/" + filename)
			});
		}

		this.entries = g_UnitClassList
			.map(unitClass => this.makeClassEntry(unitClass, templates))
			.filter(entry => entry);

		for (let index = 0; index < this.entries.length; ++index)
			for (const template of this.entries[index].templates) {
				const canonical = this.canonicalTemplate(template);
				this.covered.add(canonical);
				if (!this.reverse.has(canonical))
					this.reverse.set(canonical, index);
			}

		this.warnUncoveredTemplates(templates.map(unit => this.canonicalTemplate(unit.template)));
	}

	/**
	 * The "{civ}" form of a template path, used to compare and store the templates of different
	 * civilizations together.
	 *
	 * @param {string} path
	 * @returns {string}
	 */
	canonicalTemplate(path) {
		const parts = path.split("/");
		return parts.length == 3 && this.civCodes.has(parts[1]) ?
			parts[0] + "/{civ}/" + parts[2] :
			path;
	}

	/**
	 * The "{civ}" form of a list of templates, which is what every comparison uses.
	 *
	 * @param {string[]} templates
	 * @returns {Set<string>}
	 */
	canonicalTemplates(templates) {
		return new Set(templates.map(template => this.canonicalTemplate(template)));
	}

	/**
	 * How much of a class the disabled templates cover.
	 *
	 * Classes overlap - the champion cavalry of a civilization is also one of its champions - so
	 * a single disabled template says nothing about a class: what matters is whether the host
	 * disabled the whole class. Only that is reported as disabled, and a class the disabled
	 * templates only cut into is reported as such.
	 *
	 * @param {Object} entry
	 * @param {Set<string>} disabled - Disabled templates, in their "{civ}" form.
	 * @returns {string} "none", "partly" or "all".
	 */
	disabledState(entry, disabled) {
		const covered = this.disabledCount(entry, disabled);

		if (covered == entry.templates.length)
			return "all";

		return covered ? "partly" : "none";
	}

	/**
	 * The number of templates of a class that the disabled templates cover.
	 *
	 * @param {Object} entry
	 * @param {Set<string>} disabled - Disabled templates, in their "{civ}" form.
	 * @returns {number}
	 */
	disabledCount(entry, disabled) {
		return entry.templates
			.filter(template => disabled.has(this.canonicalTemplate(template))).length;
	}

	/**
	 * Reports the trainable units that no class of the list covers, because a host couldn't
	 * disable them. A game update that renames a class, or adds a unit with a new tag, is what
	 * introduces one.
	 *
	 * @param {string[]} templates - Templates in their "{civ}" form.
	 */
	warnUncoveredTemplates(templates) {
		const uncovered = Array.from(new Set(templates
			.filter(template => !this.covered.has(template))));

		if (!uncovered.length)
			return;

		warn("rules: no unit class covers " + uncovered.length + " unit template(s), e.g. " +
			uncovered.slice(0, this.MaxTooltipTemplates).join(", ") +
			". They can't be disabled in the Match Setup.");
	}

	/**
	 * The classes of a unit template, as the game's own Reference page reads them.
	 *
	 * A template of a game version that tags units differently has no classes here, which keeps
	 * it out of every class, hence the warning.
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
	 * @param {{template: string, filename: string, civ: string, classes: Set<string>}[]} templates
	 * @returns {Object|undefined} The entry, or undefined when the class matches no unit.
	 */
	makeClassEntry(unitClass, templates) {
		const matching = templates.filter(unit => unitMatchesClass(unitClass, unit.classes));

		if (!matching.length) {
			warn("rules: the '" + unitClass.label + "' unit class matches no unit.");
			return undefined;
		}

		// Every civilization can have a unit with the same file name, and they are the same unit
		// unless a civilization gives it its own template. A file that every playable civilization
		// has is disabled with one "{civ}" template; the others are listed one by one, so that
		// disabling e.g. the Persian Immortals doesn't also disable the champion infantry the
		// other civilizations share the file with.
		const civilizations = new Map();
		for (const unit of matching) {
			if (!civilizations.has(unit.filename))
				civilizations.set(unit.filename, new Set());
			civilizations.get(unit.filename).add(unit.civ);
		}

		const entryTemplates = [];
		for (const [filename, civs] of civilizations)
			if (civs.size == this.civCodes.size)
				entryTemplates.push("units/{civ}/" + filename);
			else
				for (const civ of civs)
					entryTemplates.push("units/" + civ + "/" + filename);

		entryTemplates.sort();

		return {
			"name": translate(unitClass.label),
			"templates": entryTemplates,
			"tooltip": this.makeTooltip(entryTemplates)
		};
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
	 * The entries that undo the given disabled templates.
	 *
	 * An entry is listed when all of its templates are disabled, so that a class is enabled
	 * again with one click. The group carries the disabled templates it covers, because those
	 * are what has to be removed from the setting - they differ from its own templates when the
	 * setting was written by a version of this mod that stored "{civ}" templates. Templates that
	 * no entry covers completely - set by a scenario map, or by an older version of this mod -
	 * are grouped by the class they belong to, marked as partly disabled, or listed as they are.
	 *
	 * @param {string[]} templates
	 * @returns {{name: string, templates: string[], disabled: string[]}[]}
	 */
	reenableEntries(templates) {
		const disabled = new Set(templates.map(template => this.canonicalTemplate(template)));
		const listed = new Map();
		const listedCanonical = new Map();
		for (let index = 0; index < this.entries.length; ++index) {
			if (!this.entries[index].templates
				.every(template => disabled.has(this.canonicalTemplate(template))))
				continue;

			listed.set(index, {
				"name": this.entries[index].name,
				"templates": this.entries[index].templates,
				"disabled": []
			});

			// The class a disabled template is offered under, when several cover it.
			for (const template of this.entries[index].templates) {
				const canonical = this.canonicalTemplate(template);
				if (!listedCanonical.has(canonical))
					listedCanonical.set(canonical, index);
			}
		}

		const groups = new Map();
		for (const template of templates) {
			const canonical = this.canonicalTemplate(template);
			const listedIndex = listedCanonical.get(canonical);
			if (listedIndex !== undefined) {
				listed.get(listedIndex).disabled.push(template);
				continue;
			}

			const index = this.reverse.get(canonical);
			const name = index === undefined ?
				template :
				sprintf(translate("%(class)s (partly disabled)"), {
					"class": this.entries[index].name
				});

			if (!groups.has(name))
				groups.set(name, { "name": name, "templates": [], "disabled": [] });

			groups.get(name).templates.push(template);
			groups.get(name).disabled.push(template);
		}

		// A class can be covered by the disabled list without holding anything of its own, when
		// the units it shares with another class are disabled: enabling it must not offer an
		// entry that removes nothing.
		return Array.from(listed.values())
			.filter(group => group.disabled.length)
			.concat(Array.from(groups.values()));
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
