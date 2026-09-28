/**
 * Templates (units and structures) which the host disabled for the entire match.
 *
 * The value lives in the game attributes, so it is synchronized to every client, persisted in
 * match settings, replays and savegames, and can be enforced by the simulation
 * (see simulation/helpers/InitGame.js).
 *
 * Entries may contain the "{civ}" placeholder. The Player component replaces it with the
 * civilization of the player who owns the entity (see Player.prototype.OnGlobalInitGame), so a
 * single entry such as "units/{civ}/infantry_spearman_b" disables that unit for every player,
 * whatever civilization they picked. Entries of civilizations that use a different template
 * simply don't match anything.
 */
GameSettings.prototype.Attributes.DisabledTemplates = class DisabledTemplates extends GameSetting
{
	init()
	{
		this.templates = [];
	}

	toInitAttributes(attribs)
	{
		if (this.templates.length)
			attribs.settings.DisabledTemplates = clone(this.templates);
	}

	fromInitAttributes(attribs)
	{
		const templates = this.getLegacySetting(attribs, "DisabledTemplates");
		this.setTemplates(Array.isArray(templates) ? templates : []);
	}

	/**
	 * Replaces the whole list. Used when loading saved games or match settings.
	 *
	 * The list is deduplicated and sorted, which keeps the serialized attributes stable.
	 *
	 * @param {string[]} templates
	 */
	setTemplates(templates)
	{
		this.templates = Array.from(new Set(templates)).sort();
	}

	/**
	 * Enables or disables the given templates.
	 *
	 * @param {string[]} templates
	 * @param {boolean} enabled - whether the templates should be disabled.
	 */
	setTemplatesEnabled(templates, enabled)
	{
		const disabled = new Set(this.templates);
		for (const template of templates)
		{
			if (enabled)
				disabled.add(template);
			else
				disabled.delete(template);
		}

		// Assign a new array, so that watchers are notified of the change.
		this.templates = Array.from(disabled).sort();
	}

	/**
	 * @param {string} template
	 * @returns {boolean}
	 */
	isTemplateDisabled(template)
	{
		return this.templates.indexOf(template) != -1;
	}
};
