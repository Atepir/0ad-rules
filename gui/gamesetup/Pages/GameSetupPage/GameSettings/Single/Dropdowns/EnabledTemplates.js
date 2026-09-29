/**
 * Lets the host enable whole classes of units that were disabled with the "Disable Unit Class"
 * setting.
 *
 * Only what is currently disabled is listed, and an entry is listed when everything it covers is
 * disabled, so that a class is made available again with one click. When more than one class is
 * disabled the first entry undoes all of them at once, which is the quickest way out of a
 * selection the host no longer wants. A template that no class covers completely (something a
 * scenario map set, or a version of this mod that listed single units) is grouped by its class,
 * or listed as it is.
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
		if (!group) {
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

	render() {
		this.setHidden(!this.banList.entries.length);

		this.groups = this.buildGroups();

		this.dropdown.list = [sprintf(this.SummaryCaption, {
			"count": g_GameSettings.disabledTemplates.templates.length
		})].concat(this.groups.map(group => group.name));

		// The placeholder is identified by an empty value, so that setSelectedValue selects it.
		this.dropdown.list_data = [""].concat(this.groups.map(group => group.name));

		// Always reselect the placeholder, so that the same class can be enabled twice in a row.
		this.setSelectedValue("");
	}

	/**
	 * The entries that undo the current setting, the first of which undoes all of it.
	 *
	 * @returns {{name: string, templates: string[], disabled: string[]}[]}
	 */
	buildGroups() {
		const disabled = g_GameSettings.disabledTemplates.templates;
		const groups = this.banList.reenableEntries(disabled);

		// With a single group there is nothing to undo in one go: choosing it is that class.
		if (groups.length > 1)
			groups.unshift({
				"name": sprintf(this.EnableAllCaption, { "count": groups.length }),
				"templates": disabled,
				"disabled": disabled
			});

		return groups;
	}

	getAutocompleteEntries() {
		return this.buildGroups().map(group => group.name);
	}

	onSelectionChange(itemIdx) {
		// The placeholder, which is selected after every change.
		if (itemIdx <= 0)
			return;

		g_GameSettings.disabledTemplates.setTemplatesEnabled(this.groups[itemIdx - 1].disabled, false);
		this.gameSettingsController.setNetworkInitAttributes();
	}
};

GameSettingControls.EnabledTemplates.prototype.TitleCaption =
	translate("Enable Unit Class");

GameSettingControls.EnabledTemplates.prototype.Tooltip =
	translate("Select a class of units to make it available again.");

GameSettingControls.EnabledTemplates.prototype.SummaryCaption =
	translate("Select a class to enable (%(count)s disabled)");

GameSettingControls.EnabledTemplates.prototype.EnableAllCaption =
	translate("Enable all disabled classes (%(count)s)");

GameSettingControls.EnabledTemplates.prototype.HoverTooltip =
	translate("Enables the following templates:\n%(templates)s");

/**
 * Maximum number of templates listed in a tooltip.
 */
GameSettingControls.EnabledTemplates.prototype.MaxTooltipTemplates = 6;

GameSettingControls.EnabledTemplates.prototype.AutocompleteOrder = 0;
