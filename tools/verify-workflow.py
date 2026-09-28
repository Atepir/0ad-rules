#!/usr/bin/env python3
"""Sanity check of .github/workflows/build-pyromod.yml (no network, needs PyYAML).

Checks that the workflow still matches this repository: the mod name, the assumption that the
mod is the repository root, the packaging/verification steps and the release steps. Run it with

    python tools/verify-workflow.py
"""

import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
WORKFLOW = ROOT / ".github" / "workflows" / "build-pyromod.yml"
MANIFEST = ROOT / "mod.json"
PACKAGING_HELPER = ROOT / "tools" / "pyromod.py"

BUILD_ACTION = "0ad-matters/gh-action-build-pyromod@v2"

problems = []


def check(condition, message):
    if not condition:
        problems.append(message)


with open(WORKFLOW, encoding="utf-8") as handle:
    try:
        doc = yaml.safe_load(handle)
    except yaml.YAMLError as error:
        print("YAML PARSE FAILED:", error)
        sys.exit(1)

# PyYAML resolves the unquoted "on" key to the boolean True (YAML 1.1).
triggers = doc.get("on", doc.get(True))
env = doc.get("env", {})
jobs = doc.get("jobs", {})

check(triggers is not None, "no 'on' triggers")
for trigger in ("push", "pull_request", "workflow_dispatch"):
    check(trigger in (triggers or {}), f"missing trigger: {trigger}")
check(
    (triggers or {}).get("push", {}).get("tags") == ["v**"], "push tags trigger changed"
)
check(
    (triggers or {}).get("push", {}).get("branches") == ["main"],
    "push branches changed",
)

check(env.get("MOD_NAME") == "rules", "MOD_NAME is not 'rules'")
check(
    "MOD_DIRECTORY" not in env,
    "MOD_DIRECTORY is set again: the packaging action only produces a valid archive when it "
    "packs the repository root",
)

build = jobs.get("build-pyromod", {})
release = jobs.get("release-pyromod", {})
check(bool(build), "missing job: build-pyromod")
check(bool(release), "missing job: release-pyromod")
check(
    build.get("if") == "${{ github.ref_type != 'tag' }}", "build job condition changed"
)
check(
    release.get("if") == "${{ github.ref_type == 'tag' }}",
    "release job condition changed",
)
check(
    release.get("permissions", {}).get("contents") == "write",
    "release needs contents: write",
)

build_steps = build.get("steps", [])
release_steps = release.get("steps", [])


def step_names(steps):
    return [step.get("name") or step.get("uses") for step in steps]


def index_of(steps, predicate):
    for index, step in enumerate(steps):
        if predicate(step):
            return index
    return None


for job_name, steps in (("build", build_steps), ("release", release_steps)):
    # The packaging has to happen before the archive is cleaned up, which has to happen before
    # it is uploaded or released.
    build_index = index_of(steps, lambda step: step.get("uses") == BUILD_ACTION)
    strip_index = index_of(
        steps,
        lambda step: step.get("name") == "Remove the repository files"
        " from the pyromod",
    )
    check_index = index_of(steps, lambda step: step.get("name") == "Check the pyromod")

    check(build_index is not None, f"{job_name}: packaging action missing")
    check(strip_index is not None, f"{job_name}: strip step missing")
    check(check_index is not None, f"{job_name}: check step missing")

    if None not in (build_index, strip_index, check_index):
        check(
            build_index < strip_index < check_index,
            f"{job_name}: expected package -> strip -> check, got "
            f"{step_names(steps)}",
        )

    for step in steps:
        if "uses" in step:
            check("@" in step["uses"], f"{job_name}: unpinned action {step['uses']}")
        if step.get("uses") == BUILD_ACTION:
            with_block = step.get("with", {})
            check(
                with_block.get("name") == "${{ env.MOD_NAME }}",
                f"{job_name}: packaging action does not use MOD_NAME",
            )
            check(
                with_block.get("version") == "${{ env.MOD_VERSION }}",
                f"{job_name}: packaging action does not use MOD_VERSION",
            )
            check(
                "directory" not in with_block,
                f"{job_name}: packaging action got a 'directory' again, which prefixes every "
                f"path in the archive with it",
            )

    for step in steps:
        run = step.get("run", "")
        if "pyromod.py" in run:
            target = run.strip().split()[-1].strip("\"'")
            check(
                target.endswith(".pyromod"),
                f"{job_name}: {step.get('name')} does not point at the built .pyromod "
                f"(got '{target}')",
            )
            check(
                target.startswith("output/"),
                f"{job_name}: {step.get('name')} does not read from the output directory",
            )

CHECKED_HELPER = "tools/pyromod.py"
check(PACKAGING_HELPER.is_file(), f"{CHECKED_HELPER} is missing")
check(
    any(CHECKED_HELPER in step.get("run", "") for step in build_steps + release_steps),
    f"the workflow no longer uses {CHECKED_HELPER}",
)

upload = [
    step
    for step in build_steps
    if step.get("uses", "").startswith("actions/upload-artifact")
]
check(
    len(upload) == 1 and upload[0]["with"]["path"] == "output/${{ env.MOD_NAME }}*.*",
    "artifact path changed",
)

release_action = [
    step
    for step in release_steps
    if step.get("uses", "").startswith("ncipollo/release-action")
]
check(
    len(release_action) == 1
    and release_action[0]["with"]["artifacts"] == "output/${{ env.MOD_NAME }}*.*",
    "release artifacts path changed",
)

# The tag -> manifest version sync has to target the manifest that the packaging action packs.
sync_step = next(
    (
        step
        for step in release_steps
        if step.get("name") == "Sync the mod manifest with the tag"
    ),
    None,
)
massage_step = next(
    (step for step in release_steps if step.get("name") == "Massage Variables"), None
)

if sync_step is None:
    problems.append("manifest version sync step missing")
else:
    run = sync_step.get("run", "")
    for fragment in ("sed -i", "grep -q", "mod.json"):
        check(fragment in run, f"manifest sync step no longer contains: {fragment}")
    check("$MOD_DIRECTORY" not in run, "manifest sync step still uses MOD_DIRECTORY")

if massage_step is None or "${MOD_VERSION:1}" not in massage_step.get("run", ""):
    problems.append("Massage Variables no longer strips the leading 'v' of the tag")

with open(MANIFEST, encoding="utf-8") as handle:
    manifest = json.load(handle)
check(
    manifest.get("name") == env.get("MOD_NAME"),
    f"mod.json name '{manifest.get('name')}' != MOD_NAME '{env.get('MOD_NAME')}'",
)
check(
    "version" in manifest,
    "mod.json has no version field for the release sync to rewrite",
)
check((ROOT / "mod.json").is_file(), "the mod manifest is not at the repository root")

print("workflow      :", WORKFLOW.relative_to(ROOT))
print("triggers      :", sorted(triggers) if triggers else None)
print("env           :", env)
print("jobs          :", sorted(jobs))
print("build steps   :", step_names(build_steps))
print("release steps :", step_names(release_steps))
print(
    "mod.json      :",
    {"name": manifest.get("name"), "version": manifest.get("version")},
)
print()
print("--- shell steps (checked in bash, see tools/pyromod.py) ---")
for step in (massage_step, sync_step):
    if step:
        print(f"# {step['name']}")
        print(step.get("run", "").rstrip())
        print()

if problems:
    print("PROBLEMS:")
    for problem in problems:
        print("  -", problem)
    sys.exit(1)

print("Workflow structure OK.")
