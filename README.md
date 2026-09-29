# rules

A 0 A.D. (0.28 "Zhuang Zhou") mod that lets the **host of a match disable whole classes of
units**.

The host picks classes in the Match Setup; the list is synchronized to every client and enforced
by the simulation, so the units of a disabled class can't be trained (units) or built (structures)
by anyone, including the AI.

## Repository layout

The **repository root is the mod**: `mod.json`, `gamesettings/`, `gui/` and `simulation/` are the
files the game loads, everything else (`README.md`, `deploy.ps1`, `tools/`, `.github/`) is
development tooling. The packaging action in `.github/workflows/build-pyromod.yml` packs the
directory it is given with paths relative to the working directory, so a mod in a subdirectory
ends up with every path prefixed by it (`rules/mod.json`) and an archive the game can't load —
hence the flat layout, and hence the `check` step of the workflow.

## Usage

1. Host a game (or play a single player match) and open **Match Setup → Player**.
2. **Disable Unit Class** — select a class of units to disable it for every player. The classes
   the host already disabled are marked with a bullet and shown in red; the first row of the
   list always summarises them (*Nothing disabled* / *Disabled: All Champion Cavalry, All
   Immortals*).
3. **Enable Unit Class** — select a class to make its units available again.

The classes are what the game itself tags its units with, so **All Champion Cavalry** disables
the champion cavalry of every civilization, whichever weapon and rank they have, and
**All Immortals** disables the three Persian templates the game marks as Immortals. The classes
are listed by unit, not by template: *All Champion Infantry* also covers the Gauls' *Naked
Fanatic*, which has no class of its own.

Only the host can change the settings; the other players see the same controls greyed out with a
summary of how many units are disabled.

## How it works

| File | Purpose |
| --- | --- |
| `gamesettings/attributes/DisabledTemplates.js` | New game setting `DisabledTemplates`, the list of disabled templates. Stored in the game attributes, hence synchronized to all clients, saved in match settings, replays and savegames. |
| `.../Single/Dropdowns/UnitClasses.js` | The unit classes the host can pick, as `all`/`none` lists of the classes the game tags units with. |
| `.../Single/Dropdowns/UnitBanList.js` | Builds the class entries from the unit templates of `simulation/templates/units/`. |
| `.../Single/Dropdowns/DisabledTemplates.js` | The "Disable Unit Class" dropdown. |
| `.../Single/Dropdowns/EnabledTemplates.js` | The "Enable Unit Class" dropdown. |
| `.../Single/Dropdowns/MatchSettingsLayout.js` | Adds both controls to the tab that holds the player settings of the *effective* Match Setup layout, and drops settings of it that this game version doesn't have (see [Compatibility](#compatibility)). |
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

## Unit classes

`UnitBanList` turns `simulation/templates/units/` into 44 class entries, one per class of
`UnitClasses.js`, and only classes can be disabled:

* a class covers every unit of a playable civilization that carries all of its classes, so
  *All Champion Infantry* covers the 34 champion infantry templates of the game, *All Immortals*
  the three Persian templates the game marks as Immortals and *All War Dogs* the Britons' war
  dogs, whatever rank, weapon or pack state a unit has;
* a unit every playable civilization has is stored once, as the `{civ}` placeholder the
  simulation expands per player, so a class disables it for all of them at once;
* a unit that only some civilizations have, or that is a different unit for some of them, is
  stored for those civilizations alone: *All Immortals* disables the Persians'
  `champion_infantry`, which is the ordinary champion infantry of every other civilization, and
  *All Cataphracts* only the Roman and Ptolemaic `champion_cavalry`;
* the classes are exclusive where the game's own classes are: *All Citizen Soldier Infantry*
  leaves out champions, heroes and mercenaries;
* together the 44 classes cover every trainable template, so no unit is left un-bannable.
  `tools/verify-unitbanlist.js` fails when a game update adds a unit no class covers;
* templates of unplayable civilizations (`pirates`) and civ-independent scenario/cheat units
  (`units/plane`, `units/merc_thorakites`, ...) are ignored, as they can't be trained.

The classes come from the game itself: every template inherits `Identity/VisibleClasses` from
its parents and mixins, which `Engine.GetTemplate().Identity.VisibleClasses._string` resolves -
the same source the game's own Reference page reads. A game update that adds, renames or drops a
class therefore changes the Match Setup without touching this mod, and a class that stops
matching any unit, or a unit no class covers, is reported in the game log
(`rules: the '...' unit class matches no unit.`, `rules: no unit class covers N unit
template(s), e.g. ...`).

Hovering a class shows up to six of the templates it disables.

## Limitations

* Only whole classes can be disabled: a single unit can't be banned on its own. Disable one
  class, or disable several and re-enable the ones the match should keep.
* Disabling a class doesn't remove units that are already on the map or spawned by a scenario.
* Technologies that unlock or improve a disabled unit remain available.
* A class isn't tied to a civilization: *All Champion Infantry* disables the champion infantry
  of every civilization, not just of one.
* The setting is meant for the host; clients need the mod to join a match that uses it, so all
  players should install it.

## Install

Install a released `rules-<version>.pyromod` in **Settings → Mod Selection**, or copy the mod
into the 0 A.D. user mods directory:

```
Windows: %USERPROFILE%\Documents\My Games\0ad\mods\rules
macOS:   ~/Library/Application Support/0ad/mods/rules
Linux:   ~/.local/share/0ad/mods/rules
```

Copy `mod.json`, `gamesettings/`, `gui/` and `simulation/` - not `tools/`, `.github/`, `deploy.ps1`
or `README.md`. `deploy.ps1` copies exactly those files and enables the mod in
`%APPDATA%\0ad\config\user.cfg`; otherwise enable it in **Settings → Mod Selection**.

A release archive placed *inside* the mod folder (`mods/rules/rules.zip`, the layout mod.io uses)
is a second copy of the mod: it can hide the files next to it. Keep the loose files as they are,
or install the `.pyromod` in **Settings → Mod Selection**, which unpacks it. `deploy.ps1` reports
and removes such an archive.

(Renamed from `disabledunits`: remove that folder from the user mods directory and replace
`disabledunits` with `rules` in `mod.enabledmods`.)

## Releases

`.github/workflows/build-pyromod.yml` packages the mod with
[`0ad-matters/gh-action-build-pyromod`](https://github.com/0ad-matters/gh-action-build-pyromod)
and publishes it:

| Event | What happens |
| --- | --- |
| push to `main`, pull request to `main`, manual run | builds `output/rules-<commit sha>.pyromod` and uploads it as a workflow artifact |
| push of a `v*` tag | builds `output/rules-<tag without its "v">.pyromod`, writes a `.sha256sum` next to it and creates or updates the GitHub release |

The tag build first rewrites the `version` in `mod.json`, so a released pyromod reports the tag
version to the game - mod compatibility checks between players compare it.

A `.pyromod` is a zip whose root contains `mod.json`. The action packs the whole repository, so
every build then runs

* `python3 tools/pyromod.py strip` to drop the development files from the archive, and
* `python3 tools/pyromod.py check` to fail the workflow when the archive does not contain this mod
  and nothing else. `check` also reports a `mod.json` that is not at the root of the archive, which
  is exactly what happens when the mod is moved back into a subdirectory.

To cut a release, tag the commit:

```
git tag v1.1.0
git push origin v1.1.0
```

The same packaging can be reproduced locally, run from the repository root (the engine has to be
0.27 or newer):

```powershell
& "E:\0ad\0 A.D. alpha\binaries\system\pyrogenesis.exe" `
  -mod=package_mod -archivebuild=. `
  -archivebuild-output="$PWD\output\rules-1.0.0.pyromod" -archivebuild-compress
python tools/pyromod.py strip output/rules-1.0.0.pyromod
python tools/pyromod.py check output/rules-1.0.0.pyromod
```

`output/` is git-ignored. The archive builder needs the `package_mod` mod, which only release
installs ship (the `0ad-bin-nodata` image the workflow uses has it), so on a development install
zip the repository with any tool and run the two `tools/pyromod.py` steps on the result - the
`strip`/`check` file list is the same.

## Compatibility

The mod adds a game setting and two controls, and it ships one modified copy of a vanilla file:
`simulation/helpers/InitGame.js`. Another mod that overrides that file wins, and then the list
isn't applied; nothing else breaks. `ignoreInCompatibilityChecks` is enabled so that the mod
isn't disabled by other mods' version checks, but it should be re-checked after a game update.

### Why the mod doesn't override `GameSettingsLayout.js`

The Match Setup settings of a tab are listed in `GameSettingsLayout.js`, so adding a setting
used to mean overriding that vanilla file. Every mod that does it fights over one file: the
settings of the mod whose copy loses disappear from the Match Setup without any message. Such a
copy is also fatal when it was written for another game version, because
`GameSettingsPanel.positionSettings` assumes every listed name is a control that exists. With
[feldmap](https://wildfiregames.com/forum/topic/53880-feldmap/) 3.0.1 installed for example,
selecting **Player** throws

```
ERROR: JavaScript error: gui/gamesetup/Pages/GameSetupPage/Panels/GameSettingsPanel.js line 131
this.gameSettingControlManager.gameSettingControls[name] is undefined
```

because its `Player` tab still lists `PopulationCapType`, a control that 0.28 replaced with
`WorldPopulation` and `WorldPopulationCap`.

This mod therefore doesn't ship that file. `MatchSettingsLayout.js` instead repairs the layout
that ended up in use right before it is laid out, which works with any copy:

* settings that have no control are dropped, with a warning in the game log,
* `DisabledTemplates` and `EnabledTemplates` are inserted into the tab that holds the player
  settings.

On an installation where another mod supplies the layout, the two settings are therefore still
visible, and a stale layout of that mod no longer breaks tab switching.

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

* `tools/verify-unitbanlist.js` runs the class matching against the real templates of the
  shipped `public.zip` and checks every invariant: 44 class entries, no duplicate or untrainable
  templates, no class left empty, and that a class covers exactly the units the game tags with
  it (computed from the dump, independently of the mod's own matching). Above all it checks that
  the classes together cover all 254 trainable templates, since a unit that no class covers could
  not be disabled at all.
* `tools/verify-matchsettingslayout.js` runs `MatchSettingsLayout.js` against the vanilla layout,
  against the stale `feldmap` layout and against the layout this mod used to ship, and checks that
  the result never lists a setting that has no control and always contains both settings.
* A headless `pyrogenesis -autostart="random/mainland" -autostart-nonvisual` run with the mod
  enabled loads the mod, runs the modified `InitGame` and simulates a match without errors.
  Instrumenting `InitGame` temporarily confirmed that the setting reaches every player
  (`units/{civ}/infantry_spearman_[abe]`, `special/spy`) and that `Player.OnGlobalInitGame` then
  expands `{civ}` per civilization (`units/athen/...`, `units/brit/...`).
* The packaging pipeline was reproduced locally as well: `pyrogenesis -archivebuild=.` from the
  repository root writes an archive with `mod.json` at its root, `tools/pyromod.py strip` reduces
  it to the eight mod files, and `check` accepts that archive while rejecting the `rules/mod.json`
  layout that broke the first CI run.
* The Match Setup GUI itself (the two dropdowns) has to be smoke-tested manually, as the
  game setup page can't be driven from the command line.

## Development

* `tools/verify.ps1` verifies the mod against an installed 0 A.D.: it dumps the shipped template
  list and the classes of every unit out of `public.zip`, runs the checks below and syntax-checks
  every mod script.
* `tools/dump-unit-classes.py` walks the parent and mixin chain of every unit template of
  `public.zip` and writes one `path<TAB>classes` line per template, exactly like the engine
  resolves them:

  ```
  python tools/dump-unit-classes.py <public.zip> <output-file>
  ```

* `tools/verify-unitbanlist.js` replays the class matching outside the game and checks the
  invariants the GUI and the simulation rely on:

  ```
  node tools/verify-unitbanlist.js <unit-classes.txt>
  ```

* `tools/verify-matchsettingslayout.js` replays the layout repair, including the feldmap 3.0.1
  layout that caused the crash above:

  ```
  node tools/verify-matchsettingslayout.js
  ```

* `tools/verify-workflow.py` parses `.github/workflows/build-pyromod.yml` and checks that the mod
  name, the packaging steps, the job conditions and the artifact paths still match this repository.
* `tools/pyromod.py` is the packaging helper the workflow uses: `strip` removes the repository
  files from a freshly built pyromod and `check` verifies the result.
* `deploy.ps1` mirrors the mod into the 0 A.D. mods directory and enables it in `user.cfg`.
