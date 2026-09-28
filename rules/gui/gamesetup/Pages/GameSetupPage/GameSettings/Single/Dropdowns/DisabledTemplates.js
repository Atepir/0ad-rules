/**
 * Lets the host disable units for the whole match.
 *
 * The first entry of the dropdown is a placeholder that also serves as a summary for players
 * who can't change the setting. Selecting any other entry disables every template of that unit
 * for all players; entries that are already disabled are colored red.
 *
 * Re-enabling is done with the "Enable Unit" setting.
 */
GameSettingControls.DisabledTemplates = class DisabledTemplates extends GameSettingControlDropdown
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
		const hovered = this.dropdown.hovered;
		this.dropdown.tooltip =
			hovered > 0 && this.banList.tooltips[hovered - 1] || this.Tooltip;
	}

	render()
	{
		this.setHidden(!this.banList.names.length);

		const disabled = g_GameSettings.disabledTemplates.templates;
		const isDisabled = index =>
			this.banList.templates[index].some(template => disabled.indexOf(template) != -1);

		this.dropdown.list = [sprintf(this.SummaryCaption, { "count": disabled.length })]
			.concat(this.banList.names.map((name, index) =>
				isDisabled(index) ? setStringTags(name, this.DisabledTags) : name));

		// The placeholder is identified by an empty value, so that setSelectedValue selects it.
		this.dropdown.list_data = [""].concat(this.banList.names);

		// Always reselect the placeholder, so that the same entry can be selected twice in a row.
		this.setSelectedValue("");
	}

	getAutocompleteEntries()
	{
		return this.banList.names;
	}

	onSelectionChange(itemIdx)
	{
		// The placeholder, which is selected after every change.
		if (itemIdx <= 0)
			return;

		g_GameSettings.disabledTemplates.setTemplatesEnabled(this.banList.templates[itemIdx - 1], true);
		this.gameSettingsController.setNetworkInitAttributes();
	}
};

GameSettingControls.DisabledTemplates.prototype.TitleCaption =
	translate("Disable Unit");

GameSettingControls.DisabledTemplates.prototype.Tooltip =
	translate("Select a unit to disable it for every player. Disabled units can't be trained or built. Already disabled units are shown in red.");

GameSettingControls.DisabledTemplates.prototype.SummaryCaption =
	translate("Select a unit to disable (%(count)s disabled)");

GameSettingControls.DisabledTemplates.prototype.DisabledTags =
	{ "color": "red" };

GameSettingControls.DisabledTemplates.prototype.AutocompleteOrder = 0;
