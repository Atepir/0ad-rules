"""Sanity check of .github/workflows/build-pyromod.yml (no network, no extra deps)."""
import json
import sys

import yaml

WORKFLOW = r"c:\Users\atepi\rules\.github\workflows\build-pyromod.yml"
MOD_JSON = r"c:\Users\atepi\rules\rules\mod.json"

problems = []

with open(WORKFLOW, encoding="utf-8") as handle:
    text = handle.read()

try:
    doc = yaml.safe_load(text)
except yaml.YAMLError as error:
    print("YAML PARSE FAILED:", error)
    sys.exit(1)

# PyYAML resolves the unquoted "on" key to the boolean True (YAML 1.1).
triggers = doc.get("on", doc.get(True))
if triggers is None:
    problems.append("no 'on' triggers")
else:
    for trigger in ("push", "pull_request", "workflow_dispatch"):
        if trigger not in triggers:
            problems.append(f"missing trigger: {trigger}")
    if triggers.get("push", {}).get("tags") != ["v**"]:
        problems.append("push tags trigger changed")
    if triggers.get("push", {}).get("branches") != ["main"]:
        problems.append("push branches trigger changed")

env = doc.get("env", {})
if env.get("MOD_NAME") != "rules":
    problems.append("MOD_NAME is not 'rules'")
if env.get("MOD_DIRECTORY") != "rules":
    problems.append("MOD_DIRECTORY is not 'rules'")

jobs = doc.get("jobs", {})
for name in ("build-pyromod", "release-pyromod"):
    if name not in jobs:
        problems.append(f"missing job: {name}")

build = jobs.get("build-pyromod", {})
release = jobs.get("release-pyromod", {})

if build.get("if") != "${{ github.ref_type != 'tag' }}":
    problems.append("build job condition changed")
if release.get("if") != "${{ github.ref_type == 'tag' }}":
    problems.append("release job condition changed")
if release.get("permissions", {}).get("contents") != "write":
    problems.append("release job needs contents: write")


def steps_of(job):
    return job.get("steps", [])


build_steps = steps_of(build)
release_steps = steps_of(release)

# Every 'uses' must be pinned to a ref and every action step that packages must pass the
# mod directory, otherwise the repository files would end up inside the pyromod.
for job_name, steps in (("build", build_steps), ("release", release_steps)):
    for step in steps:
        if "uses" in step and "@" not in step["uses"]:
            problems.append(f"{job_name}: unpinned action {step['uses']}")
        if step.get("uses", "").startswith("0ad-matters/gh-action-build-pyromod"):
            with_block = step.get("with", {})
            if with_block.get("directory") != "${{ env.MOD_DIRECTORY }}":
                problems.append(f"{job_name}: pyromod action does not use MOD_DIRECTORY")
            if with_block.get("name") != "${{ env.MOD_NAME }}":
                problems.append(f"{job_name}: pyromod action does not use MOD_NAME")

upload = [s for s in build_steps if s.get("uses", "").startswith("actions/upload-artifact")]
if not upload or upload[0]["with"]["path"] != "output/${{ env.MOD_NAME }}*.*":
    problems.append("artifact path changed")

release_action = [s for s in release_steps if s.get("uses", "").startswith("ncipollo/release-action")]
if not release_action or release_action[0]["with"]["artifacts"] != "output/${{ env.MOD_NAME }}*.*":
    problems.append("release artifacts path changed")

# The tag -> manifest version sync has to run before the build.
sync_step = next((s for s in release_steps
                  if s.get("name") == "Sync the mod manifest with the tag"), None)
massage_step = next((s for s in release_steps
                     if s.get("name") == "Massage Variables"), None)
sync_index = release_steps.index(sync_step) if sync_step else None
build_index = next((i for i, s in enumerate(release_steps)
                    if s.get("uses", "").startswith("0ad-matters/gh-action-build-pyromod")), None)

if sync_step is None:
    problems.append("manifest version sync step missing")
else:
    run = sync_step.get("run", "")
    for fragment in ("sed -i", "grep -q", '"$MOD_DIRECTORY/mod.json"', "${MOD_VERSION}"):
        if fragment not in run:
            problems.append(f"manifest sync step no longer contains: {fragment}")
    if build_index is None or sync_index > build_index:
        problems.append("manifest version sync runs after the build")

if massage_step is None or "${MOD_VERSION:1}" not in massage_step.get("run", ""):
    problems.append("Massage Variables no longer strips the leading 'v' of the tag")

with open(MOD_JSON, encoding="utf-8") as handle:
    manifest = json.load(handle)
if manifest.get("name") != env.get("MOD_NAME"):
    problems.append(f"mod.json name '{manifest.get('name')}' != MOD_NAME '{env.get('MOD_NAME')}'")
if "version" not in manifest:
    problems.append("mod.json has no version field for the release sync to rewrite")

print("triggers      :", sorted(triggers) if triggers else None)
print("env           :", env)
print("jobs          :", sorted(jobs))
print("build steps   :", len(build_steps), "| release steps:", len(release_steps))
print("mod.json      :", {"name": manifest.get("name"), "version": manifest.get("version")})
print("build job     :", [s.get("name") or s.get("uses") for s in build_steps])
print("release job   :", [s.get("name") or s.get("uses") for s in release_steps])
print()
print("--- shell steps (checked in bash, see the README) ---")
for step in (massage_step, sync_step):
    if step:
        print(f"# {step['name']}")
        print(step.get("run", "").rstrip())
        print()

if problems:
    print("\nPROBLEMS:")
    for problem in problems:
        print("  -", problem)
    sys.exit(1)

print("\nWorkflow structure OK.")
