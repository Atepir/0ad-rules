/**
 * Lets the host disable whole classes of units for the whole match.
 *
 * The first entry of the dropdown is a placeholder: it is the row the control marks as selected,
 * and it counts and names the disabled classes, so that the marker of the control summarizes the
 * setting - for the other players too, who can't change it. Selecting it does nothing, which is
 * what makes it possible to pick the same class twice in a row. Classes the host disabled are
 * colored red and carry a bullet, so they are recognizable in the list even where the color is
 * missed; a class that a disabled class only cuts into is orange and says so on hover.
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
		if (hovered <= 0) {
			this.dropdown.tooltip = this.Tooltip;
			return;
		}

		const entry = this.banList.entries[hovered - 1];
		let tooltip = entry.tooltip;

		// A class can be cut into by the disabled classes without being disabled itself, which
		// the color alone doesn't say.
		if (this.states[hovered - 1] == "partly")
			tooltip += "\n" + sprintf(this.PartlyDisabledTooltip, {
				"count": this.banList.disabledCount(entry, this.disabled),
				"total": entry.templates.length
			});

		this.dropdown.tooltip = tooltip;
	}

	render() {
		this.setHidden(!this.banList.entries.length);

		this.disabled = this.banList
			.canonicalTemplates(g_GameSettings.disabledTemplates.templates);
		this.states = this.banList.entries
			.map(entry => this.banList.disabledState(entry, this.disabled));

		this.dropdown.list = [this.makeSummaryCaption()]
			.concat(this.banList.entries.map((entry, index) => {
				switch (this.states[index]) {
				case "all":
					return setStringTags(this.DisabledMarker + entry.name, this.DisabledTags);
				case "partly":
					return setStringTags(entry.name, this.PartlyDisabledTags);
				}

				return entry.name;
			}));

		// The placeholder is identified by an empty value, so that setSelectedValue selects it.
		this.dropdown.list_data = [""].concat(this.banList.entries.map(entry => entry.name));

		// Always reselect the placeholder, so that the same class can be picked twice in a row.
		this.setSelectedValue("");
	}

	/**
	 * The caption of the placeholder row, hence of the row the control shows as selected: it
	 * counts and names the disabled classes, because a dropdown can mark one row only and this
	 * is the one that carries the state.
	 *
	 * @returns {string}
	 */
	makeSummaryCaption() {
		const names = this.banList.entries
			.filter((entry, index) => this.states[index] == "all")
			.map(entry => entry.name);

		const shown = names.slice(0, this.MaxSummaryNames);
		if (!shown.length)
			return this.NothingDisabledCaption;

		let caption = sprintf(this.DisabledCaption, {
			"count": names.length,
			"classes": shown.join(", ")
		});
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
	translate("Select a class of units to disable it for every player. Disabled units can't be trained or built. Red classes are disabled, orange ones are partly disabled by another class.");

GameSettingControls.DisabledTemplates.prototype.NothingDisabledCaption =
	translate("Nothing disabled");

GameSettingControls.DisabledTemplates.prototype.DisabledCaption =
	translate("Disabled (%(count)s): %(classes)s");

GameSettingControls.DisabledTemplates.prototype.MoreDisabledCaption =
	translate("and %(count)s more");

GameSettingControls.DisabledTemplates.prototype.PartlyDisabledTooltip =
	translate("%(count)s of its %(total)s templates are disabled.");

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

/**
 * The color the game itself uses for a dropdown entry that is not simply the value.
 */
GameSettingControls.DisabledTemplates.prototype.PartlyDisabledTags =
	{ "color": "orange" };

GameSettingControls.DisabledTemplates.prototype.AutocompleteOrder = 0;
