#!/usr/bin/env python3
"""
upgrade.py - Check and update hardcoded software versions in project files.

Targets:
  - Debian forky slim (Docker Hub)              -> Dockerfile (FROM + version stamp)
  - Claude Code latest release (downloads.claude.ai) -> Dockerfile
  - npm devDependencies/dependencies (registry.npmjs.org) -> package.json,
    then `npm install` to sync package-lock.json and node_modules.
    @types/node stays on the Node major that CI uses
    (.github/workflows/deploy.yml `node-version`), and typescript on the
    highest major allowed by the latest svelte-check's peer range.

Usage:
  python3 upgrade.py            # check and apply updates
  python3 upgrade.py --dry-run  # only report
"""

import json
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent

DOCKERFILE = WORKSPACE / "Dockerfile"
PACKAGE_JSON = WORKSPACE / "package.json"
DEPLOY_WORKFLOW = WORKSPACE / ".github/workflows/deploy.yml"

DRY_RUN = "--dry-run" in sys.argv[1:]


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def fetch(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} fetching {url}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Network error fetching {url}: {e.reason}") from e


def fetch_json(url, headers=None):
    return json.loads(fetch(url, headers))


# ---------------------------------------------------------------------------
# Version fetchers
# ---------------------------------------------------------------------------

SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


def get_latest_claude():
    """Return the latest Claude Code version from the official releases bucket."""
    url = "https://downloads.claude.ai/claude-code-releases/latest"
    version = fetch(url).decode().strip()
    if not SEMVER.fullmatch(version):
        raise RuntimeError(f"Unexpected version {version!r} from {url}")
    return version


def get_latest_debian_forky_slim():
    """Return the latest forky-YYYYMMDD-slim tag from Docker Hub."""
    url = (
        "https://hub.docker.com/v2/repositories/library/debian/tags"
        "?name=forky-&ordering=last_updated&page_size=100"
    )
    data = fetch_json(url)
    pattern = re.compile(r"^forky-(\d{8})-slim$")
    candidates = []
    for result in data.get("results", []):
        m = pattern.match(result["name"])
        if m:
            candidates.append((m.group(1), result["name"]))  # (date_str, full_tag)
    if not candidates:
        raise RuntimeError("No forky-YYYYMMDD-slim tags found on Docker Hub")
    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates[0][1]  # e.g. "forky-20260316-slim"


def get_latest_npm(name, major=None):
    """Return the latest stable version of an npm package.

    With `major`, return the highest stable version within that major.
    """
    url = "https://registry.npmjs.org/" + urllib.parse.quote(name, safe="@")
    if major is None:
        data = fetch_json(url + "/latest")
        version = data.get("version", "")
        if not SEMVER.fullmatch(version):
            raise RuntimeError(f"Unexpected version {version!r} for {name}")
        return version
    data = fetch_json(url, {"Accept": "application/vnd.npm.install-v1+json"})
    best = None
    for v in data.get("versions", {}):
        m = SEMVER.fullmatch(v)
        if m and int(m.group(1)) == major:
            key = tuple(int(x) for x in m.groups())
            if best is None or key > best[0]:
                best = (key, v)
    if best is None:
        raise RuntimeError(f"No stable {name} release for major {major}")
    return best[1]


def peer_max_major(package, peer):
    """Highest major of `peer` accepted by the latest `package` release."""
    url = "https://registry.npmjs.org/" + urllib.parse.quote(package, safe="@") + "/latest"
    spec = fetch_json(url).get("peerDependencies", {}).get(peer, "")
    majors = [int(m) for m in re.findall(r"(?:^|\|\|)\s*[\^~>=]*\s*(\d+)", spec)]
    if not majors:
        raise RuntimeError(f"No {peer} peer range in {package}: {spec!r}")
    return max(majors)


def ci_node_major():
    """Node major version used by CI (setup-node `node-version`)."""
    return int(read_current(DEPLOY_WORKFLOW, r"node-version:\s*['\"]?(\d+)"))


# ---------------------------------------------------------------------------
# File helpers
# ---------------------------------------------------------------------------

def rel(path):
    return path.relative_to(WORKSPACE)


def read_current(path, pattern):
    """Extract current value using a regex with one capture group."""
    content = path.read_text()
    m = re.search(pattern, content, re.MULTILINE)
    if not m:
        raise RuntimeError(f"Pattern {pattern!r} not found in {rel(path)}")
    return m.group(1)


def update_file(path, pattern, replacement):
    """Replace first regex match in file. Returns True if content changed."""
    content = path.read_text()
    new_content, count = re.subn(pattern, replacement, content, count=1, flags=re.MULTILINE)
    if count == 0:
        raise RuntimeError(f"Pattern {pattern!r} not found in {rel(path)}")
    if new_content == content:
        return False
    if not DRY_RUN:
        path.write_text(new_content)
    return True


# ---------------------------------------------------------------------------
# Per-target check + update logic
# ---------------------------------------------------------------------------

def check(current, latest, path, search_pattern, replacement):
    if current == latest:
        print(f"  ok        {current}")
        return False
    print(f"  outdated  {current} -> {latest}")
    changed = update_file(path, search_pattern, replacement)
    if changed and not DRY_RUN:
        print(f"  updated   {rel(path)}")
    return changed


def stamp_dockerfile():
    stamp = date.today().strftime("%y%m%d")
    update_file(DOCKERFILE, r'^LABEL version="\S+"', f'LABEL version="{stamp}"')
    update_file(DOCKERFILE, r"^ENV MUNDANA_UPGRADE=\S+", f"ENV MUNDANA_UPGRADE={stamp}")
    print(f"  stamp     {stamp}")


def run_debian_forky():
    print("[debian forky slim / Dockerfile]")
    current = read_current(DOCKERFILE, r"^FROM debian:(\S+)")
    latest = get_latest_debian_forky_slim()
    changed = check(
        current, latest,
        DOCKERFILE,
        r"^FROM debian:\S+",
        f"FROM debian:{latest}",
    )
    if changed:
        stamp_dockerfile()
    return changed


def run_claude():
    print("[claude-code / Dockerfile]")
    current = read_current(DOCKERFILE, r"^ENV MUNDANA_CLAUDE_UPGRADE=(\S+)")
    latest = get_latest_claude()
    return check(
        current, latest,
        DOCKERFILE,
        r"^ENV MUNDANA_CLAUDE_UPGRADE=\S+",
        f"ENV MUNDANA_CLAUDE_UPGRADE={latest}",
    )


# Packages kept on a fixed major: name -> function returning the major.
NPM_PINNED_MAJOR = {
    "@types/node": ci_node_major,
    "typescript": lambda: peer_max_major("svelte-check", "typescript"),
}

NPM_SPEC = re.compile(r"^([\^~]?)(\d+\.\d+\.\d+)$")


def run_npm():
    print("[npm / package.json]")
    pkg = json.loads(PACKAGE_JSON.read_text())
    changed = False
    for section in ("dependencies", "devDependencies"):
        for name, spec in pkg.get(section, {}).items():
            m = NPM_SPEC.fullmatch(spec)
            if not m:
                print(f"  skip      {name} {spec} (not a plain version)")
                continue
            prefix, current = m.groups()
            pin = NPM_PINNED_MAJOR.get(name)
            latest = get_latest_npm(name, pin() if pin else None)
            if current == latest:
                print(f"  ok        {name} {current}")
                continue
            print(f"  outdated  {name} {current} -> {latest}")
            pkg[section][name] = prefix + latest
            changed = True
    if changed and not DRY_RUN:
        PACKAGE_JSON.write_text(json.dumps(pkg, indent=2, ensure_ascii=False) + "\n")
        print(f"  updated   {rel(PACKAGE_JSON)}")
        print("  running   npm install")
        subprocess.run(["npm", "install"], cwd=WORKSPACE, check=True)
    return changed


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

CHECKS = [
    run_debian_forky,
    run_claude,
    run_npm,
]


def main():
    any_updated = False
    any_error = False

    for fn in CHECKS:
        try:
            updated = fn()
            any_updated = any_updated or updated
        except Exception as e:
            print(f"  ERROR: {e}")
            any_error = True
        print()

    if any_error:
        print("Finished with errors.")
        sys.exit(1)
    elif any_updated and DRY_RUN:
        print("Updates available (dry run, nothing changed).")
    elif any_updated:
        print("All updates applied. Run `make test` before committing.")
    else:
        print("Everything is up to date.")


if __name__ == "__main__":
    main()
