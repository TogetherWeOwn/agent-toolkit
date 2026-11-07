"""Verify a script-free npm pack against the tested files, without extracting it."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile

MAX_BYTES = 64 * 1024 * 1024
MAX_FILES = 2048


def digest(data):
    return hashlib.sha256(data).hexdigest()


def package_files(package):
    dist = package / "dist"
    required = [dist / "plugins/github-broker/src" / f"{name}.js"
                for name in ("client", "worker", "manifest")]
    if not all(path.is_file() for path in required) or dist.is_symlink():
        raise ValueError("missing compiled broker entry points")
    paths = list(dist.rglob("*"))
    if any(path.is_symlink() or not (path.is_file() or path.is_dir()) for path in paths):
        raise ValueError("non-regular dist entry")
    paths = [path for path in paths if path.is_file()]
    paths += [package / name for name in ("package.json", "README.md", "THREAT-MODEL.md", "ACCEPTANCE.md")]
    if len(paths) > MAX_FILES or sum(path.stat().st_size for path in paths) > MAX_BYTES:
        raise ValueError("package exceeds evidence budget")
    if any(path.is_symlink() or not path.is_file() for path in paths):
        raise ValueError("non-regular package input")
    return {path.relative_to(package).as_posix(): path.read_bytes() for path in sorted(paths)}


def verify_archive(archive, files):
    if archive.is_symlink() or not archive.is_file() or archive.stat().st_size > MAX_BYTES:
        raise ValueError("invalid package archive")
    seen = set()
    total = 0
    with tarfile.open(archive, "r:gz") as stream:
        for index, member in enumerate(stream):
            total += member.size
            if index >= MAX_FILES or total > MAX_BYTES:
                raise ValueError("archive exceeds evidence budget")
            if not member.isfile() or not member.name.startswith("package/"):
                raise ValueError("non-regular archive entry")
            name = member.name.removeprefix("package/")
            if name not in files or name in seen or member.size != len(files[name]):
                raise ValueError("unexpected, duplicate or changed package entry")
            with stream.extractfile(member) as body:
                if body.read(member.size + 1) != files[name]:
                    raise ValueError("archive differs from tested build")
            seen.add(name)
    if seen != set(files):
        raise ValueError("incomplete package archive")


def main():
    source, output = (Path(value).resolve(strict=True) for value in sys.argv[1:])
    source_sha, recipe_sha = os.environ["SOURCE_SHA"], os.environ["RECIPE_SHA"]
    if not all(re.fullmatch(r"[0-9a-f]{40}", value) for value in (source_sha, recipe_sha)):
        raise ValueError("immutable source and recipe identities required")
    def git(root, *args):
        return subprocess.check_output(["git", "-C", str(root), *args], text=True).strip()
    recipe = Path(__file__).resolve().parents[2]
    if git(source, "rev-parse", "HEAD") != source_sha or git(recipe, "rev-parse", "HEAD") != recipe_sha:
        raise ValueError("checkout identity mismatch")
    archives = list(output.glob("*.tgz"))
    if len(archives) != 1 or not re.fullmatch(r"[a-z0-9.-]+\.tgz", archives[0].name):
        raise ValueError("exactly one safely named archive required")
    files = package_files(source / "plugins/github-broker")
    verify_archive(archives[0], files)
    lock = source / "package-lock.json"
    sdk = json.loads(lock.read_bytes())["packages"]["node_modules/@paperclipai/plugin-sdk"]
    installed = json.loads((source / "node_modules/@paperclipai/plugin-sdk/package.json").read_bytes())
    declared = json.loads(files["package.json"])["dependencies"]["@paperclipai/plugin-sdk"]
    if not sdk.get("integrity", "").startswith("sha512-") or installed["version"] != sdk["version"] or declared != sdk["version"]:
        raise ValueError("SDK declaration, lock and installed version disagree")
    manifest = {name: digest(data) for name, data in files.items() if name.startswith("dist/")}
    (output / "dist-manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    shutil.copyfile(lock, output / "package-lock.json")
    metadata = {
        "sourceSha": source_sha, "sourceTree": git(source, "rev-parse", "HEAD^{tree}"),
        "recipeSha": recipe_sha, "recipeScriptSha256": digest(Path(__file__).read_bytes()),
        "workflowSha256": digest((recipe / ".github/workflows/package-github-broker.yml").read_bytes()),
        "package": archives[0].name, "packageSha256": digest(archives[0].read_bytes()),
        "lockfileSha256": digest(lock.read_bytes()), "sdk": sdk,
        "node": subprocess.check_output(["node", "--version"], text=True).strip(),
        "npm": subprocess.check_output(["npm", "--version"], text=True).strip(),
        "runId": os.environ["GITHUB_RUN_ID"], "runAttempt": os.environ["GITHUB_RUN_ATTEMPT"],
        "recipe": ["npm ci --ignore-scripts", "npm test", "npm pack --ignore-scripts"],
        "correspondence": "Every archive member byte-matches the tested dist or allowlisted package metadata; no extraction or install.",
    }
    (output / "build-evidence.json").write_text(json.dumps(metadata, indent=2, sort_keys=True) + "\n")
    checksums = "".join(f"{digest(path.read_bytes())}  {path.name}\n" for path in sorted(output.iterdir()))
    (output / "SHA256SUMS").write_text(checksums)
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
        summary.write(f"## Broker candidate (not install approval)\n\nSource: `{source_sha}`\n\nRecipe: `{recipe_sha}`\n\nPackage: `{metadata['package']}`\n\nSHA-256: `{metadata['packageSha256']}`\n\n````text\n{checksums}````\n")


if __name__ == "__main__":
    main()
