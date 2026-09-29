/**
 * Lets the host disable whole classes of units for the whole match.
 *
 * The first entry of the dropdown is a placeholder: it is the row the control marks as selected,
 * and it names the disabled classes, so that the marker of the control summarizes the setting -
 * for the other players too, who can't change it. Selecting it does nothing, which is what makes
 * it possible to pick the same class twice in a row. Disabled classes are colored red and carry
 * a bullet, so they are recognizable in the list even where the color is missed.
 *
 * Re-enabling is done with the "Enable Unit Class" setting.
 */
GameSettingControls.DisabledTemplates = class DisabledTemplates extends GameSettingControlDropdown {
	constructor(...args) {
		super(...args);

		this.banList = getUnitBanList();

		g_GameSettings.disabledTemplates.watch(() => this.render(), ["templates"]);
		this.render();
	}

	onHoverChange() {
		const hovered = this.dropdown.hovered;
		this.dropdown.tooltip =
			hovered > 0 && this.banList.entries[hovered - 1].tooltip || this.Tooltip;
	}

	render() {
		this.setHidden(!this.banList.entries.length);

		const disabled = new Set(g_GameSettings.disabledTemplates.templates
			.map(template => this.banList.canonicalTemplate(template)));
		const isDisabled = entry => entry.templates
			.some(template => disabled.has(this.banList.canonicalTemplate(template)));

		this.dropdown.list = [this.makeSummaryCaption(disabled)]
			.concat(this.banList.entries.map(entry =>
				isDisabled(entry) ?
					setStringTags(this.DisabledMarker + entry.name, this.DisabledTags) :
					entry.name));

		// The placeholder is identified by an empty value, so that setSelectedValue selects it.
		this.dropdown.list_data = [""].concat(this.banList.entries.map(entry => entry.name));

		// Always reselect the placeholder, so that the same class can be picked twice in a row.
		this.setSelectedValue("");
	}

	/**
	 * The caption of the placeholder row, hence of the row the control shows as selected: it
	 * names the disabled classes, because a dropdown can mark one row only and this is the one
	 * that carries the state.
	 *
	 * @param {Set<string>} disabled - Disabled templates, in their "{civ}" form.
	 * @returns {string}
	 */
	makeSummaryCaption(disabled) {
		const names = this.banList.entries
			.filter(entry => entry.templates
				.every(template => disabled.has(this.banList.canonicalTemplate(template))))
			.map(entry => entry.name);

		const shown = names.slice(0, this.MaxSummaryNames);
		if (!shown.length)
			return this.NothingDisabledCaption;

		let caption = sprintf(this.DisabledCaption, { "classes": shown.join(", ") });
		if (shown.length < names.length)
			caption += " " + sprintf(this.MoreDisabledCaption, {
				"count": names.length - shown.length
			});

		return caption;
	}

	getAutocompleteEntries() {
		return this.banList.entries.map(entry => entry.name);
	}

	onSelectionChange(itemIdx) {
		// The placeholder, which is selected after every change.
		if (itemIdx <= 0)
			return;

		g_GameSettings.disabledTemplates.setTemplatesEnabled(this.banList.entries[itemIdx - 1].templates, true);
		this.gameSettingsController.setNetworkInitAttributes();
	}
};

GameSettingControls.DisabledTemplates.prototype.TitleCaption =
	translate("Disable Unit Class");

GameSettingControls.DisabledTemplates.prototype.Tooltip =
	translate("Select a class of units to disable it for every player. Disabled units can't be trained or built. Already disabled classes are shown in red.");

GameSettingControls.DisabledTemplates.prototype.NothingDisabledCaption =
	translate("Nothing disabled");

GameSettingControls.DisabledTemplates.prototype.DisabledCaption =
	translate("Disabled: %(classes)s");

GameSettingControls.DisabledTemplates.prototype.MoreDisabledCaption =
	translate("and %(count)s more");

/**
 * Prefix of a disabled entry, so that it is recognizable without relying on its color. The game
 * uses the same bullet in its own interface, so every shipped font has it.
 */
GameSettingControls.DisabledTemplates.prototype.DisabledMarker = "\u2022 ";

/**
 * Maximum number of class names in the summary row.
 */
GameSettingControls.DisabledTemplates.prototype.MaxSummaryNames = 2;

GameSettingControls.DisabledTemplates.prototype.DisabledTags =
	{ "color": "red" };

GameSettingControls.DisabledTemplates.prototype.AutocompleteOrder = 0;
