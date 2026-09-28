/**
 * Lets the host re-enable units that were disabled with the "Disable Unit" setting.
 *
 * Only the currently disabled units are listed, grouped the same way as in the other setting,
 * so that a unit and all of its ranks is made available again with one click.
 */
GameSettingControls.EnabledTemplates = class EnabledTemplates extends GameSettingControlDropdown {
	constructor(...args) {
		super(...args);

		this.banList = getUnitBanList();

		g_GameSettings.disabledTemplates.watch(() => this.render(), ["templates"]);
		this.render();
	}

	onHoverChange() {
		const group = this.groups[this.dropdown.hovered - 1];
		this.dropdown.tooltip = group ?
			sprintf(this.HoverTooltip, { "templates": group.templates.join("\n") }) :
			this.Tooltip;
	}

	render() {
		this.setHidden(!this.banList.names.length);

		const disabled = g_GameSettings.disabledTemplates.templates;
		this.groups = this.banList.groupTemplates(disabled);

		this.dropdown.list = [sprintf(this.SummaryCaption, { "count": disabled.length })]
			.concat(this.groups.map(group => group.name));

		// The placeholder is identified by an empty value, so that setSelectedValue selects it.
		this.dropdown.list_data = [""].concat(this.groups.map(group => group.name));

		// Always reselect the placeholder, so that the same entry can be selected twice in a row.
		this.setSelectedValue("");
	}

	getAutocompleteEntries() {
		return this.banList.groupTemplates(g_GameSettings.disabledTemplates.templates)
			.map(group => group.name);
	}

	onSelectionChange(itemIdx) {
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
	translate("Select a unit to make it available again.");

GameSettingControls.EnabledTemplates.prototype.SummaryCaption =
	translate("Select a unit to enable (%(count)s disabled)");

GameSettingControls.EnabledTemplates.prototype.HoverTooltip =
	translate("Enables the following templates:\n%(templates)s");

GameSettingControls.EnabledTemplates.prototype.AutocompleteOrder = 0;
