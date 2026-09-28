# rules

A 0 A.D. (0.28 "Zhuang Zhou") mod that lets the **host of a match disable individual units**.

The host picks units in the Match Setup; the list is synchronized to every client and enforced
by the simulation, so disabled units can't be trained (units) or built (structures) by anyone,
including the AI.

## Usage

1. Host a game (or play a single player match) and open **Match Setup → Player**.
2. **Disable Unit** — select a unit to disable it for every player.
   Already disabled units are shown in red.
3. **Enable Unit** — select a unit to make it available again.

Both settings list units by unit rather than by template, so selecting *Infantry Spearman*
disables the basic, advanced and elite versions of that unit for **all** civilizations at once,
and *Catafalque* disables it for every civilization that has one.

Only the host can change the settings; the other players see the same controls greyed out with a
summary of how many units are disabled.

## How it works

| File | Purpose |
| --- | --- |
| `gamesettings/attributes/DisabledTemplates.js` | New game setting `DisabledTemplates`, the list of disabled templates. Stored in the game attributes, hence synchronized to all clients, saved in match settings, replays and savegames. |
| `gui/gamesetup/Pages/GameSetupPage/GameSettings/Single/Dropdowns/UnitBanList.js` | Builds the list of disableable units from `simulation/templates/units/`. |
| `.../Single/Dropdowns/DisabledTemplates.js` | The "Disable Unit" dropdown. |
| `.../Single/Dropdowns/EnabledTemplates.js` | The "Enable Unit" dropdown. |
| `gui/gamesetup/Pages/GameSetupPage/GameSettings/GameSettingsLayout.js` | *Overrides* the vanilla settings layout to add both controls to the "Player" tab. |
| `simulation/helpers/InitGame.js` | *Overrides* the vanilla `InitGame` to apply the list with `ICmpPlayer::SetDisabledTemplates`. |

The engine already knows how to enforce a disabled template:

* `Trainer` filters disabled templates out of every training list, so the buttons disappear from
  the GUI and the simulation rejects the order (`simulation/components/Trainer.js`).
* `Builder` filters them out of build lists as well, so structures can be disabled too
  (`simulation/components/Builder.js`).
* `ICmpPlayer::GetDisabledTemplates` is sent to the GUI, so the selection panel is accurate.
* The AI queries `isTemplateDisabled` before queueing anything.

Templates are stored with the `{civ}` placeholder, e.g. `units/{civ}/infantry_spearman_b`.
`Player.prototype.OnGlobalInitGame` replaces it with each player's civilization when the
simulation starts, which is what makes one entry disable a unit for every civilization.

## Unit entries

`UnitBanList` groups the templates of `simulation/templates/units/` into 175 entries:

* the ranks of a unit (`_a`, `_b`, `_e`) are one entry;
* packed/unpacked and ship-garrison (`_[abe]_trireme`) variants are one entry;
* templates of unplayable civilizations (`pirates`) and civ-independent scenario/cheat units
  (`units/plane`, `units/merc_thorakites`, ...) are ignored, as they can't be trained.

Hovering an entry shows the exact templates it disables.

## Limitations

* Disabling a unit doesn't remove units that are already on the map or spawned by a scenario.
* Technologies that unlock or improve a disabled unit remain available.
* The setting is meant for the host; clients need the mod to join a match that uses it, so all
  players should install it.

## Install

Copy the `rules` directory (the one containing `mod.json`) into the 0 A.D. user mods
directory:

```
Windows: %USERPROFILE%\Documents\My Games\0ad\mods\rules
macOS:   ~/Library/Application Support/0ad/mods/rules
Linux:   ~/.local/share/0ad/mods/rules
```

Then enable it in **Settings → Mod Selection**, or add it to `mod.enabledmods` in
`%APPDATA%\0ad\config\user.cfg`.

`deploy.ps1` copies the mod to the Windows mods directory and enables it.

Note: after the rename from `disabledunits`, the mod folder in the user mods directory has to be
removed (or overwritten by `deploy.ps1`), and `disabledunits` has to be replaced by `rules` in
`mod.enabledmods`.

## Releases

`.github/workflows/build-pyromod.yml` packages the mod with
[`0ad-matters/gh-action-build-pyromod`](https://github.com/0ad-matters/gh-action-build-pyromod)
and publishes it:

| Event | What happens |
| --- | --- |
| push to `main`, pull request to `main`, manual run | builds `output/rules-<commit sha>.pyromod` and uploads it as a workflow artifact |
| push of a `v*` tag | builds `output/rules-<tag without its "v">.pyromod`, writes a `.sha256sum` next to it and creates or updates the GitHub release |

`directory: rules` tells the action which folder to package, so the repository files (`tools/`,
`deploy.ps1`, `README.md`, `.github/`) never end up inside the `.pyromod`. The tag build also
rewrites the `version` in `rules/mod.json`, so a released pyromod reports the tag version to the
game — mod compatibility checks between players compare it.

To cut a release, tag the commit:

```
git tag v1.1.0
git push origin v1.1.0
```

The same packaging can be reproduced locally (the engine has to be 0.27 or newer):

```powershell
# run from the repository root
& "E:\0ad\0 A.D. alpha\binaries\system\pyrogenesis.exe" `
  -mod=package_mod -archivebuild=rules `
  -archivebuild-output="$PWD\output\rules-1.0.0.pyromod" -archivebuild-compress
```

`output/` is git-ignored.

## Compatibility

The mod only *adds* a game setting and two controls, but it ships modified copies of
`GameSettingsLayout.js` and `simulation/helpers/InitGame.js`. If another mod overrides the same
files, the one loaded last wins. `ignoreInCompatibilityChecks` is enabled so that the mod isn't
disabled by other mods' version checks, but it should be re-checked after a game update.

### Why `"dependencies": ["0ad>=0.27.0"]` and not `0.28.0`?

0 A.D. 0.28 still ships `binaries/data/mods/public/mod.json` with `"version": "0.27.0"`
(`Mod::CheckForIncompatibleMods` compares a dependency against the version in that manifest,
not against the engine version). A dependency of `0ad>=0.28.0` therefore makes the mod — and in
fact every mod declaring `0ad>=0.28.0` or `0ad=0.28.0` — be rejected with
`ERROR: Trying to start with incompatible mods: ...`, and in `-autostart` (quickstart) runs the
game doesn't start at all.

With `0ad>=0.27.0` the mod loads on 0.28, while installs whose manifest is older still reject it.
Mods declaring `0ad>=0.28.0` or `0ad=0.28.0`, such as `feldmap`, `localratings`, `autociv` and
`asciimojis`, have the same problem and need the same fix.

## Verification

The mod was checked against a 0.28.0 installation:

* `tools/verify-unitbanlist.js` runs the unit grouping against the dumped template list of the
  shipped `public.zip` and checks every invariant (no duplicate or unreachable templates,
  no rank/packed/trireme variants leaking into the names, 175 entries covering 254 templates).
* A headless `pyrogenesis -autostart="random/mainland" -autostart-nonvisual` run with the mod
  enabled loads the mod, runs the modified `InitGame` and simulates a match without errors.
  Instrumenting `InitGame` temporarily confirmed that the setting reaches every player
  (`units/{civ}/infantry_spearman_[abe]`, `special/spy`) and that `Player.OnGlobalInitGame` then
  expands `{civ}` per civilization (`units/athen/...`, `units/brit/...`).
* The Match Setup GUI itself (the two dropdowns) has to be smoke-tested manually, as the
  game setup page can't be driven from the command line.

## Development

* `tools/verify.ps1` verifies the mod against an installed 0 A.D.: it dumps the shipped template
  list out of `public.zip`, runs the checks below and syntax-checks every mod script.
* `tools/verify-unitbanlist.js` replays the unit grouping logic outside the game and checks the
  invariants the GUI and the simulation rely on:

  ```
  node tools/verify-unitbanlist.js <unit-templates.txt>
  ```

* `tools/verify-workflow.py` parses `.github/workflows/build-pyromod.yml` and checks that the
  mod name, directory, job conditions and artifact paths still match this repository.
* `deploy.ps1` mirrors the mod into the 0 A.D. mods directory and enables it in `user.cfg`.
