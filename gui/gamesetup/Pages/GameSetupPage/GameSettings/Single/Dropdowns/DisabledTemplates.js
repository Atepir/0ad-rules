/**
 * Lets the host disable units, and whole classes of units, for the whole match.
 *
 * The first entry of the dropdown is a placeholder that also serves as a summary for players
 * who can't change the setting. The classes come first and are colored (see UnitClasses.js);
 * selecting any other entry disables every template of that class or unit for all players.
 * Entries that are already disabled are colored red.
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
			hovered > 0 && this.banList.entries[hovered - 1].tooltip || this.Tooltip;
	}

	render()
	{
		this.setHidden(!this.banList.entries.length);

		const disabled = g_GameSettings.disabledTemplates.templates;
		const isDisabled = entry =>
			entry.templates.some(template => disabled.indexOf(template) != -1);

		this.dropdown.list = [sprintf(this.SummaryCaption, { "count": disabled.length })]
			.concat(this.banList.entries.map(entry =>
			{
				if (isDisabled(entry))
					return setStringTags(entry.name, this.DisabledTags);

				return entry.isClass ? setStringTags(entry.name, this.ClassTags) : entry.name;
			}));

		// The placeholder is identified by an empty value, so that setSelectedValue selects it.
		this.dropdown.list_data = [""].concat(this.banList.entries.map(entry => entry.name));

		// Always reselect the placeholder, so that the same entry can be selected twice in a row.
		this.setSelectedValue("");
	}

	getAutocompleteEntries()
	{
		return this.banList.entries.map(entry => entry.name);
	}

	onSelectionChange(itemIdx)
	{
		// The placeholder, which is selected after every change.
		if (itemIdx <= 0)
			return;

		g_GameSettings.disabledTemplates.setTemplatesEnabled(this.banList.entries[itemIdx - 1].templates, true);
		this.gameSettingsController.setNetworkInitAttributes();
	}
};

GameSettingControls.DisabledTemplates.prototype.TitleCaption =
	translate("Disable Unit");

GameSettingControls.DisabledTemplates.prototype.Tooltip =
	translate("Select a unit, or a class of units, to disable it for every player. Disabled units can't be trained or built. Already disabled entries are shown in red.");

GameSettingControls.DisabledTemplates.prototype.SummaryCaption =
	translate("Select a unit or class to disable (%(count)s disabled)");

GameSettingControls.DisabledTemplates.prototype.DisabledTags =
	{ "color": "red" };

/**
 * Classes are the coarse entries, colored so that they stand out from the individual units.
 */
GameSettingControls.DisabledTemplates.prototype.ClassTags =
	{ "color": "orange" };

GameSettingControls.DisabledTemplates.prototype.AutocompleteOrder = 0;
