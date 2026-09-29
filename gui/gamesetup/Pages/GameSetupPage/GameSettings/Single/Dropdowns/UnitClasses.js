/**
 * The unit classes the host can disable in the Match Setup.
 *
 * Three classes only - the ones that turned out broken in a game release and that a host
 * therefore wants out of a match: champion cavalry, the Gauls' fanatics and the Persian
 * Immortals. Anything else a host might want to ban is out of this mod's scope.
 *
 * A class matches on the classes the game tags its units with ("Champion", "Cavalry",
 * "Immortal", ...). Every template inherits the tags of its parents and of the civilization and
 * unit mixins it is built from, and the resolved list is what the game's own Reference page
 * reads through Engine.GetTemplate().Identity.VisibleClasses. A game update that retags a unit
 * therefore moves it between the classes without this file being touched.
 *
 * The Fanatics are the exception: the game tags the Naked Fanatic as an ordinary champion
 * infantry unit, so that class matches the template file instead.
 */
var g_UnitClassList = [
    // The champion cavalry of every civilization, whichever weapon and rank they have.
    { "label": "Champion Cavalry", "all": ["Champion", "Cavalry"] },

    // The Gauls' Naked Fanatic.
    { "label": "Fanatics", "files": ["champion_fanatic"] },

    // The Immortals: the Persian units the game tags as Immortal.
    { "label": "Immortals", "all": ["Immortal"] }
];

/**
 * Whether a unit belongs to a class.
 *
 * A class matches on the classes of a unit; a class that names files matches those instead,
 * because the game has no class for what it means (a fanatic is tagged as champion infantry).
 *
 * @param {Object} unitClass - Entry of g_UnitClassList.
 * @param {string} filename - Template file name, without the ".xml" extension.
 * @param {Set<string>} classes - Classes the game tags the template with.
 * @returns {boolean}
 */
function unitMatchesClass(unitClass, filename, classes) {
    if (unitClass.files)
        return unitClass.files.includes(filename);

    return (unitClass.all || []).every(name => classes.has(name)) &&
        (unitClass.none || []).every(name => !classes.has(name));
}
