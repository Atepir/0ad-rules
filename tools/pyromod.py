#!/usr/bin/env python3
"""Helpers used by .github/workflows/build-pyromod.yml.

A .pyromod is a zip archive whose root contains mod.json. It is built by the engine
(`pyrogenesis -archivebuild=<directory> -archivebuild-output=<file>.pyromod`), which is what
0ad-matters/gh-action-build-pyromod@v2 does in a container.

That action packs the directory it is given, so with the mod at the repository root the archive
also gets the files that only belong to the repository (README.md, deploy.ps1, tools/, .github/).
`strip` removes them, `check` verifies the result - so a broken archive fails the workflow instead
of being published.

    python3 tools/pyromod.py strip output/rules-1.0.0.pyromod
    python3 tools/pyromod.py check output/rules-1.0.0.pyromod

Both subcommands are also useful locally, see the "Releases" section of the README.
"""

import argparse
import sys
import zipfile
from pathlib import Path

#: The manifest that has to sit at the root of the archive.
MANIFEST = "mod.json"

#: Directories of the mod itself. Used to notice a botched strip.
MOD_DIRECTORIES = ("gamesettings", "gui", "simulation")

#: Files and directories that belong to the repository rather than to the mod.
REPOSITORY_ONLY = (
    ".git",
    ".github/",
    ".dist/",
    "output/",
    "tools/",
    "README.md",
    "deploy.ps1",
    ".gitignore",
    ".gitattributes",
    ".editorconfig",
)


def is_repository_only(name):
    """Whether an archive entry is a repository file that must not be shipped."""
    for entry in REPOSITORY_ONLY:
        if entry.endswith("/"):
            if name.startswith(entry):
                return True
        elif name == entry or name.startswith(entry + "/"):
            return True
    return False


def read_entries(archive):
    """Returns [(name, data)] for every regular file in the archive."""
    with zipfile.ZipFile(archive) as handle:
        return [(info.filename, handle.read(info))
                for info in handle.infolist() if not info.is_dir()]


def write_entries(archive, entries):
    """Rewrites the archive with exactly the given entries."""
    temporary = archive.with_name(archive.name + ".tmp")
    with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as handle:
        for name, data in entries:
            handle.writestr(name, data)
    temporary.replace(archive)


def strip(archive):
    """Removes the repository files from a freshly built pyromod."""
    if not archive.is_file():
        print(f"error: {archive} does not exist", file=sys.stderr)
        return 1

    entries = read_entries(archive)
    kept = [(name, data) for name, data in entries if not is_repository_only(name)]
    removed = [name for name, _ in entries if is_repository_only(name)]

    if not removed:
        print(f"nothing to remove from {archive.name}")
    else:
        for name in removed:
            print(f"removed {name}")
        write_entries(archive, kept)

    print(f"{archive.name}: {len(kept)} entries kept, {len(removed)} removed")
    return 0


def check(archive):
    """Verifies that the archive is a pyromod that only contains the mod."""
    if not archive.is_file():
        print(f"error: {archive} does not exist", file=sys.stderr)
        return 1

    try:
        names = [name for name, _ in read_entries(archive)]
    except zipfile.BadZipFile as error:
        print(f"error: {archive} is not a valid zip archive: {error}", file=sys.stderr)
        return 1

    problems = []

    # This is the failure mode of the packaging action when it is not given the repository root:
    # the engine then stores every path prefixed with the mod directory (e.g. "rules/mod.json"),
    # and the game no longer finds the manifest.
    if MANIFEST not in names:
        problems.append(f"{MANIFEST} is not at the root of the archive")
        prefixed = sorted(name for name in names if name.endswith("/" + MANIFEST))
        for name in prefixed:
            problems.append(f"  found {name} instead of {MANIFEST}")

    for name in names:
        if is_repository_only(name):
            problems.append(f"repository file in the archive: {name}")

    for directory in MOD_DIRECTORIES:
        if not any(name.startswith(directory + "/") for name in names):
            problems.append(f"the mod directory {directory}/ is missing from the archive")

    known = {MANIFEST} | {directory + "/" for directory in MOD_DIRECTORIES}
    for top_level in sorted({name.split("/")[0] + ("/" if "/" in name else "") for name in names}):
        if is_repository_only(top_level) or top_level in known:
            continue
        print(f"warning: unexpected entry '{top_level}' - add it to tools/pyromod.py if it is "
              f"part of the mod, or to REPOSITORY_ONLY if it is not", file=sys.stderr)

    print(f"{archive.name}: {len(names)} entries")
    for name in sorted(names):
        print(f"  {name}")

    if problems:
        print(file=sys.stderr)
        for problem in problems:
            print(f"error: {problem}", file=sys.stderr)
        return 1

    print("the archive contains the mod and nothing else")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    subparsers = parser.add_subparsers(dest="command", required=True)

    for name, help_text in (("strip", "remove the repository files from the pyromod"),
                            ("check", "verify that the pyromod contains the mod and nothing else")):
        subparsers.add_parser(name, help=help_text).add_argument(
            "archive", type=Path, help="the .pyromod to process")

    arguments = parser.parse_args()
    return {"strip": strip, "check": check}[arguments.command](arguments.archive)


if __name__ == "__main__":
    sys.exit(main())
