/**
 * Lets the host enable units, and whole classes of units, that were disabled with the
 * "Disable Unit" setting.
 *
 * Only what is currently disabled is listed. An entry is offered when everything it covers is
 * disabled, so that a class (colored, see UnitClasses.js), or the three ranks of a unit, are
 * made available again with one click.
 */
GameSettingControls.EnabledTemplates = class EnabledTemplates extends GameSettingControlDropdown
{
	constructor(...args)
	{
		super(...args);

		this.banList = getUnitBanList();

		g_GameSettings.disabledTemplates.watch(() => this.render(), ["templates"]);
		this.render();
	}

	onHoverChange()
	{
		const group = this.groups[this.dropdown.hovered - 1];
		if (!group)
		{
			this.dropdown.tooltip = this.Tooltip;
			return;
		}

		const shown = group.templates.slice(0, this.MaxTooltipTemplates);
		let tooltip = sprintf(this.HoverTooltip, { "templates": shown.join("\n") });

		if (shown.length < group.templates.length)
			tooltip += "\n" + sprintf(translate("... and %(count)s more."), {
				"count": group.templates.length - shown.length
			});

		this.dropdown.tooltip = tooltip;
	}

	render()
	{
		this.setHidden(!this.banList.entries.length);

		const disabled = g_GameSettings.disabledTemplates.templates;
		this.groups = this.banList.reenableEntries(disabled);

		this.dropdown.list = [sprintf(this.SummaryCaption, { "count": disabled.length })]
			.concat(this.groups.map(group =>
				group.isClass ? setStringTags(group.name, this.ClassTags) : group.name));

		// The placeholder is identified by an empty value, so that setSelectedValue selects it.
		this.dropdown.list_data = [""].concat(this.groups.map(group => group.name));

		// Always reselect the placeholder, so that the same entry can be selected twice in a row.
		this.setSelectedValue("");
	}

	getAutocompleteEntries()
	{
		return this.banList.reenableEntries(g_GameSettings.disabledTemplates.templates)
			.map(group => group.name);
	}

	onSelectionChange(itemIdx)
	{
		// The placeholder, which is selected after every change.
		if (itemIdx <= 0)
			return;

		g_GameSettings.disabledTemplates.setTemplatesEnabled(this.groups[itemIdx - 1].templates, false);
		this.gameSettingsController.setNetworkInitAttributes();
	}
};

GameSettingControls.EnabledTemplates.prototype.TitleCaption =
	translate("Enable Unit");

GameSettingControls.EnabledTemplates.prototype.Tooltip =
	translate("Select a unit, or a class of units, to make it available again.");

GameSettingControls.EnabledTemplates.prototype.SummaryCaption =
	translate("Select a unit or class to enable (%(count)s disabled)");

GameSettingControls.EnabledTemplates.prototype.HoverTooltip =
	translate("Enables the following templates:\n%(templates)s");

/**
 * Maximum number of templates listed in a tooltip.
 */
GameSettingControls.EnabledTemplates.prototype.MaxTooltipTemplates = 6;

/**
 * Classes are the coarse entries, colored so that they stand out from the individual units.
 */
GameSettingControls.EnabledTemplates.prototype.ClassTags =
	{ "color": "orange" };

GameSettingControls.EnabledTemplates.prototype.AutocompleteOrder = 0;
