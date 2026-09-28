"""Dumps the classes of every unit template of an installed 0 A.D., for the offline checks.

A template doesn't declare its classes itself: it inherits them from the parent chain, and the
mixins of the civilization and of the unit it is built from (<Entity parent="civ/athen|hoplite|
spec_champ|template_unit_champion_infantry_spearman">) are part of that chain. This walks the
chain exactly like the engine does, merges the "VisibleClasses" token lists and writes one line
per template:

    simulation/templates/units/athen/champion_infantry.xml<TAB>Champion Infantry Melee Soldier Spearman

Usage: python tools/dump-unit-classes.py [<public.zip>] [<output-file>]
"""
import os
import sys
import zipfile
from xml.etree import ElementTree

DEFAULT_GAME_DIRECTORY = r"E:\0ad\0 A.D. alpha"
DEFAULT_OUTPUT = os.path.join(os.environ.get("TEMP", "."), "rules-unit-classes.txt")
TEMPLATE_ROOT = "simulation/templates/"


def default_zip():
    return os.path.join(DEFAULT_GAME_DIRECTORY, "binaries", "data", "mods", "public", "public.zip")


class Templates:
    """Reads the templates of one archive and resolves their parent chains."""

    def __init__(self, zip_path):
        self.archive = zipfile.ZipFile(zip_path)
        self.names = set(self.archive.namelist())
        self.cache = {}
        self.missing = set()

    def load(self, path):
        """Returns (parent, classes) of a template, or None when it isn't in the archive."""
        if path in self.cache:
            return self.cache[path]

        result = None
        try:
            root = ElementTree.fromstring(self.archive.read(path).decode("utf-8", errors="replace"))
            identity = root.find("Identity")
            classes = []
            if identity is not None:
                node = identity.find("VisibleClasses")
                if node is not None and (node.text or "").strip():
                    classes = (node.text or "").split()
            result = (root.get("parent"), classes)
        except (KeyError, ElementTree.ParseError):
            result = None

        self.cache[path] = result
        return result

    def find(self, part):
        """A parent attribute names a template, or a mixin of simulation/templates/mixins/."""
        for candidate in (TEMPLATE_ROOT + part + ".xml", TEMPLATE_ROOT + "mixins/" + part + ".xml"):
            if candidate in self.names:
                return candidate
        return None

    def classes(self, path, classes=None, seen=None):
        """Merges the classes of the whole chain of a template into a set."""
        classes = set() if classes is None else classes
        seen = set() if seen is None else seen

        if path in seen:
            return classes

        seen.add(path)
        loaded = self.load(path)
        if loaded is None:
            self.missing.add(path)
            return classes

        parent, own = loaded
        for name in own:
            # "tokens" lists may remove a class of an ancestor again with a "-" prefix.
            if name.startswith("-"):
                classes.discard(name[1:])
            else:
                classes.add(name)

        if parent:
            for part in parent.split("|"):
                found = self.find(part)
                if found:
                    self.classes(found, classes, seen)
                else:
                    self.missing.add(part)

        return classes


def main():
    if len(sys.argv) > 1 and sys.argv[1] not in ("-h", "--help"):
        zip_path = sys.argv[1]
    else:
        zip_path = default_zip()

    if len(sys.argv) > 2:
        output = sys.argv[2]
    else:
        output = DEFAULT_OUTPUT

    if not os.path.isfile(zip_path):
        raise SystemExit(f"public.zip not found at '{zip_path}'.")

    templates = Templates(zip_path)
    unit_paths = sorted(name for name in templates.names
                        if name.startswith(TEMPLATE_ROOT + "units/") and name.endswith(".xml"))

    vocabulary = {}
    with open(output, "w", encoding="utf-8", newline="\n") as handle:
        for path in unit_paths:
            classes = sorted(templates.classes(path))
            for name in classes:
                vocabulary[name] = vocabulary.get(name, 0) + 1
            handle.write(path + "\t" + " ".join(classes) + "\n")

    print(f"Dumped the classes of {len(unit_paths)} unit templates to '{output}'.")
    print(f"  distinct classes : {len(vocabulary)}")
    print("  most common      : " + ", ".join(
        f"{name} ({count})" for name, count in
        sorted(vocabulary.items(), key=lambda item: -item[1])[:8]))

    if templates.missing:
        print(f"  WARNING: {len(templates.missing)} parents could not be resolved, "
              f"e.g. {sorted(templates.missing)[:3]}")


if __name__ == "__main__":
    main()
