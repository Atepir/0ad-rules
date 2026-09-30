# -*- coding: utf-8 -*-
"""Check, from the installed game, which researches the mod hides.

This tool re-reads the game data on its own (the unit templates and the technologies) instead of
trusting the mod, then asserts the promises made in the README:

  * a research is hidden only when *every* unit it unlocks or improves is disabled,
  * "Unlock Champion Infantry" stays as long as a civilization can still train champion infantry,
  * "Immortals" goes as soon as the Immortals are off,
  * disabling one class never hides a research that concerns another one.

Usage: python tools/verify-disabled-researches.py <public.zip>
"""

import importlib.util
import io
import os
import re
import sys
import zipfile
from xml.etree import ElementTree

# The classes of gui/gamesetup/.../Dropdowns/UnitClasses.js, in the order they appear there.
# `files` names units one by one, `all` matches the classes of a unit.
CLASSES = [
    {"label": "Champion Cavalry", "all": ["Champion", "Cavalry"]},
    {"label": "Fanatics", "files": ["champion_fanatic"]},
    {"label": "Immortals", "all": ["Immortal"]},
]

CIVS = [
    "athen", "brit", "cart", "celt", "gaul", "germ", "han", "iber", "kush", "mace", "maur",
    "pers", "ptol", "rome", "scyth", "sele", "spart", "theb",
]

failures = []


def fail(message):
    failures.append(message)


def tokens(text):
    return [token for token in (text or "").split() if token]


def read(archive, name):
    with archive.open(name) as handle:
        return handle.read().decode("utf-8", "replace")


def load_dumper():
    """The tool that already walks the parent chains of the templates, so the classes of a unit
    are resolved in exactly one place."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dump-unit-classes.py")
    spec = importlib.util.spec_from_file_location("dump_unit_classes", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def template_requirements(templates, path, needed=None, seen=None):
    """The researches a template needs to be trainable, merged along its parent chain.

    A "-" token is a research that must *not* be researched yet ("-phase_city" gives the phase),
    so only the plain ones unlock the unit, exactly like the engine's token lists.
    """
    needed = [] if needed is None else needed
    seen = set() if seen is None else seen

    if path in seen:
        return needed
    seen.add(path)

    try:
        root = ElementTree.fromstring(read(templates.archive, path))
    except (KeyError, ElementTree.ParseError):
        return needed

    node = root.find("Requirements/Techs")
    if node is None:
        # The templates declare them inside their identity.
        node = root.find("Identity/Requirements/Techs")
    if node is not None:
        for token in tokens(node.text):
            if token.startswith("-"):
                if token[1:] in needed:
                    needed.remove(token[1:])
            elif token not in needed:
                needed.append(token)

    parent = root.get("parent")
    for part in (parent or "").split("|"):
        if not part:
            continue
        found = templates.find(part)
        if found:
            template_requirements(templates, found, needed, seen)

    return needed


def load_units(templates):
    """The unit templates of the civilizations, with their classes and their unlock researches."""
    units = {}
    prefix = "simulation/templates/units/"

    for name in sorted(templates.names):
        if not name.startswith(prefix) or not name.endswith(".xml"):
            continue

        parts = name.split("/")
        if len(parts) != 5 or parts[3] not in CIVS:
            continue

        units[name] = {
            "classes": templates.classes(name),
            "unlocks": template_requirements(templates, name),
            "civ": parts[3],
            "file": parts[4][:-len(".xml")],
        }

    return units


def read_technologies(archive):
    technologies = {}
    for name in archive.namelist():
        if not re.match(r"simulation/data/technologies/[^/]+\.json$", name):
            continue
        technologies[name.rsplit("/", 1)[-1][:-len(".json")]] = read(archive, name)
    return technologies


def json_fields(text):
    """The affects of a technology and of its modifications, without a JSON parser."""
    affects = []
    for match in re.finditer(r'"affects"\s*:\s*(\[[^\]]*\]|"[^"]*")', text):
        value = match.group(1).strip()
        if value.startswith("["):
            affects += re.findall(r'"([^"]*)"', value)
        else:
            affects.append(value.strip('"'))
    return affects


def matches(classes, queries):
    for query in queries:
        for token in tokens(query):
            if token[0] in "!-":
                if token[1:] in classes:
                    return False
            elif token not in classes:
                return False
    return True


def disabled_templates(classes, labels):
    """The templates covered by the given classes, exactly like UnitClasses.js does."""
    disabled = set()
    for entry in CLASSES:
        if entry["label"] not in labels:
            continue
        for name, template in classes.items():
            if "files" in entry:
                if template["file"] in entry["files"]:
                    disabled.add(name)
            elif all(c in template["classes"] for c in entry["all"]):
                disabled.add(name)
    return disabled


def hidden_researches(classes, technologies, labels):
    disabled = disabled_templates(classes, labels)
    hidden = set()
    for name, text in technologies.items():
        concerned = set()
        for unit, template in classes.items():
            if name in template["unlocks"]:
                concerned.add(unit)
        affects = json_fields(text)
        if affects:
            for unit, template in classes.items():
                if matches(set(template["classes"]), affects):
                    concerned.add(unit)
        if concerned and concerned <= disabled:
            hidden.add(name)
    return hidden, disabled


def main():
    if len(sys.argv) < 2:
        print("usage: verify-disabled-researches.py <public.zip>")
        return 2

    dumper = load_dumper()
    with zipfile.ZipFile(sys.argv[1]) as archive:
        units = load_units(dumper.Templates(sys.argv[1]))
        technologies = read_technologies(archive)

    classes = {name: {"classes": set(template["classes"]), "unlocks": template["unlocks"],
                      "civ": template["civ"], "file": template["file"]}
               for name, template in units.items()}

    if not classes:
        fail("no unit template read from %s" % sys.argv[1])
    if len(technologies) < 100:
        fail("only %d technologies read" % len(technologies))

    labels = [entry["label"] for entry in CLASSES]

    # Every class on its own, then all of them: a research is hidden when its units are gone.
    for label in labels:
        hidden, disabled = hidden_researches(classes, technologies, [label])
        if not disabled:
            fail("the class %s disables nothing" % label)
        for name in hidden:
            text = technologies[name]
            affects = json_fields(text)
            # The research must concern the disabled templates only.
            concerned = set(u for u, t in classes.items() if name in t["unlocks"])
            for unit, template in classes.items():
                if affects and matches(set(template["classes"]), affects):
                    concerned.add(unit)
            if not concerned <= disabled:
                fail("%s is hidden while %s is still trainable" %
                     (name, sorted(concerned - disabled)[0]))
            if not concerned:
                fail("%s is hidden but improves and unlocks nothing" % name)

    # The crisp expectations of the feature.
    hidden, _ = hidden_researches(classes, technologies, ["Immortals"])
    if "immortals" not in hidden:
        fail("the Immortals research is not hidden when the Immortals are disabled")
    for name in ("unlock_champion_infantry", "unlock_champion_cavalry", "nisean_horses"):
        if name in hidden:
            fail("%s is hidden while the units it unlocks or improves are available" % name)

    hidden, _ = hidden_researches(classes, technologies, ["Champion Cavalry"])
    for name in ("unlock_champion_cavalry", "nisean_horses"):
        if name not in hidden:
            fail("%s is not hidden when the champion cavalry is disabled" % name)
    for name in ("unlock_champion_infantry", "immortals"):
        if name in hidden:
            fail("disabling the champion cavalry hides %s" % name)

    hidden, disabled = hidden_researches(classes, technologies, labels)
    for expected in ("immortals", "nisean_horses", "unlock_champion_cavalry"):
        if expected not in hidden:
            fail("%s is not hidden when every class is disabled" % expected)
    # The champion infantry of the other civilizations is still trainable, so its research stays.
    if "unlock_champion_infantry" in hidden and len(disabled) < len(classes):
        fail("the champion infantry research is hidden while units are still available")

    print("unit templates read: %d" % len(classes))
    print("technologies read:   %d" % len(technologies))
    print("templates disabled:  %s -> %d, %s -> %d, %s -> %d" % (
        labels[0], len(disabled_templates(classes, [labels[0]])),
        labels[1], len(disabled_templates(classes, [labels[1]])),
        labels[2], len(disabled_templates(classes, [labels[2]]))))
    print("researches hidden:   all -> %s" % ", ".join(sorted(
        hidden_researches(classes, technologies, labels)[0])))
    for label in labels:
        print("                     %s -> %s" % (label, ", ".join(sorted(
            hidden_researches(classes, technologies, [label])[0])) or "-"))

    if failures:
        print("\nfailures:")
        for message in failures:
            print("  FAIL %s" % message)
        return 1

    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
