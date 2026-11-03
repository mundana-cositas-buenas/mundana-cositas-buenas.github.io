#!/usr/bin/env python3
"""
release.py - Show or bump the Mundana release version.

The release version is the `version` field of package.json; package-lock.json
repeats it (top level and the root package) and is kept in sync.

Usage:
  python3 release.py            # print the current version
  python3 release.py X.Y.Z      # set a new version (must be greater)
"""

import json
import re
import sys
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent

PACKAGE_JSON = WORKSPACE / "package.json"
PACKAGE_LOCK = WORKSPACE / "package-lock.json"

VERSION_RE = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")


def parse_version(text):
    m = VERSION_RE.match(text)
    if not m:
        raise ValueError(f"invalid version {text!r} (expected X.Y.Z)")
    return tuple(int(n) for n in m.groups())


def dump(data):
    # Same format npm writes: 2-space indent, non-ASCII kept, final newline.
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def load(path):
    """Reads a JSON file, refusing it if rewriting would change more than the version."""
    text = path.read_text(encoding="utf-8")
    data = json.loads(text)
    if dump(data) != text:
        raise RuntimeError(f"{path.name} is not in npm's JSON format; run `npm install` first")
    return data


def current_version():
    return load(PACKAGE_JSON)["version"]


def set_version(new):
    pkg = load(PACKAGE_JSON)
    lock = load(PACKAGE_LOCK)

    old = pkg["version"]
    if lock.get("version") != old or lock.get("packages", {}).get("", {}).get("version") != old:
        raise RuntimeError(f"{PACKAGE_LOCK.name} is out of sync with {PACKAGE_JSON.name}; run `npm install` first")

    pkg["version"] = new
    lock["version"] = new
    lock["packages"][""]["version"] = new

    # Serialize both before writing so a failure can't leave them half-updated.
    outputs = [(PACKAGE_JSON, dump(pkg)), (PACKAGE_LOCK, dump(lock))]
    for path, text in outputs:
        path.write_text(text, encoding="utf-8")
        print(f"  {path.name}: {old} -> {new}")


def main(args):
    if not args:
        print(current_version())
        return 0

    if len(args) != 1:
        print(__doc__.strip(), file=sys.stderr)
        return 2

    new = args[0].removeprefix("v")
    old = current_version()
    try:
        new_v = parse_version(new)
        old_v = parse_version(old)
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    if new_v <= old_v:
        print(f"ERROR: new version {new} must be greater than the current one ({old})", file=sys.stderr)
        return 1

    set_version(new)
    print(f"Release {new} ready. Review the diff, run `make test` and commit.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except (OSError, RuntimeError, ValueError, KeyError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
