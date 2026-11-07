import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const helper = fileURLToPath(new URL("../.github/scripts/broker-artifact.py", import.meta.url));
const workflow = readFileSync(new URL("../.github/workflows/package-github-broker.yml", import.meta.url), "utf8");
const fixture = `
import io, pathlib, runpy, sys, tarfile, tempfile
api = runpy.run_path(sys.argv[1])
with tempfile.TemporaryDirectory() as temp:
    root = pathlib.Path(temp)
    package = root / "plugin"
    dist = package / "dist/plugins/github-broker/src"
    dist.mkdir(parents=True)
    for name in ("worker.js", "client.js", "manifest.js"):
        (dist / name).write_text("export const fixture = true;\\n")
    for name in ("package.json", "README.md", "THREAT-MODEL.md", "ACCEPTANCE.md"):
        (package / name).write_text("{}\\n")
    files = api["package_files"](package)
    def archive(entries):
        target = root / "candidate.tgz"
        with tarfile.open(target, "w:gz") as stream:
            for name, body, kind in entries:
                member = tarfile.TarInfo(name)
                member.type = kind
                member.size = len(body)
                if kind == tarfile.SYMTYPE:
                    member.linkname = "../../outside"
                stream.addfile(member, io.BytesIO(body))
        return target
    entries = [("package/" + name, data, tarfile.REGTYPE) for name, data in files.items()]
`;

function python(body) {
  const result = spawnSync("python3", ["-I", "-c", fixture + body, helper], {
    encoding: "utf8", timeout: 10000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

test("broker package evidence matches every packed byte including worker and REST client", () => {
  python(`
    api["verify_archive"](archive(entries), files)
    assert len(files) == 7
    assert api["digest"](b"abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
`);
});

test("broker package evidence refuses tampering, missing entries, links and unsafe archive paths", () => {
  python(`
    cases = [entries[:-1], entries + [entries[0]],
             [(entries[0][0], b"changed", tarfile.REGTYPE)] + entries[1:],
             [(entries[0][0], b"x" * len(entries[0][1]), tarfile.REGTYPE)] + entries[1:],
             entries + [("package/../../escape", b"x", tarfile.REGTYPE)],
             entries + [("package/.env", b"secret-canary", tarfile.REGTYPE)],
             entries + [("package/link", b"", tarfile.SYMTYPE)],
             entries + [("package/hardlink", b"", tarfile.LNKTYPE)],
             entries + [("package/directory", b"", tarfile.DIRTYPE)]]
    for case in cases:
        try:
            api["verify_archive"](archive(case), files)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid archive accepted")
    for entry in (dist / "client.js", package / "README.md"):
        original = entry.read_bytes()
        entry.unlink()
        entry.symlink_to(package / "package.json")
        try:
            api["package_files"](package)
        except ValueError:
            pass
        else:
            raise AssertionError("symlink input accepted")
        entry.unlink()
        entry.write_bytes(original)
    (dist / "worker.js").unlink()
    try:
        api["package_files"](package)
    except ValueError:
        pass
    else:
        raise AssertionError("missing worker accepted")
`);
});

test("broker package evidence bounds archive work and package bytes", () => {
  python(`
    api["verify_archive"].__globals__["MAX_FILES"] = 1
    try:
        api["verify_archive"](archive(entries), files)
    except ValueError:
        pass
    else:
        raise AssertionError("unbounded members")
    api["package_files"].__globals__["MAX_BYTES"] = 1
    try:
        api["package_files"](package)
    except ValueError:
        pass
    else:
        raise AssertionError("unbounded build files")
`);
});

test("broker package evidence binds recipe, source, lockfile and SDK with verifiable checksums", () => {
  python(`
    import json, os, shutil
    source, output = root / "source", root / "output"
    (source / "plugins").mkdir(parents=True)
    shutil.move(package, source / "plugins/github-broker")
    package = source / "plugins/github-broker"
    sdk = {"version": "2026.1023.0", "integrity": "sha512-synthetic", "resolved": "https://registry.npmjs.org/synthetic"}
    lock = json.dumps({"packages": {"node_modules/@paperclipai/plugin-sdk": sdk}})
    (source / "package-lock.json").write_text(lock)
    installed = source / "node_modules/@paperclipai/plugin-sdk"
    installed.mkdir(parents=True)
    (installed / "package.json").write_text(json.dumps({"version": sdk["version"]}))
    (package / "package.json").write_text(json.dumps({"dependencies": {"@paperclipai/plugin-sdk": sdk["version"]}}))
    files = api["package_files"](package)
    entries = [("package/" + name, data, tarfile.REGTYPE) for name, data in files.items()]
    output.mkdir()
    archive(entries).rename(output / "candidate.tgz")
    os.environ.update(SOURCE_SHA="a" * 40, RECIPE_SHA="b" * 40, GITHUB_RUN_ID="123", GITHUB_RUN_ATTEMPT="2", GITHUB_STEP_SUMMARY=str(root / "summary"))
    def command(args, text):
        if args[0] == "git":
            if args[-1] == "HEAD^{tree}":
                return "c" * 40
            return ("a" if args[2] == str(source) else "b") * 40
        return "v24.21.0" if args[0] == "node" else "11.0.0"
    api["main"].__globals__["subprocess"].check_output = command
    sys.argv = [sys.argv[1], str(source), str(output)]
    api["main"]()
    evidence = json.loads((output / "build-evidence.json").read_text())
    assert evidence["sourceSha"] == "a" * 40 and evidence["recipeSha"] == "b" * 40
    assert evidence["sourceTree"] == "c" * 40 and evidence["sdk"] == sdk
    assert evidence["lockfileSha256"] == api["digest"](lock.encode())
    manifest = json.loads((output / "dist-manifest.json").read_text())
    assert manifest == {name: api["digest"](data) for name, data in files.items() if name.startswith("dist/")}
    sums = (output / "SHA256SUMS").read_text().splitlines()
    assert len(sums) == 4
    for line in sums:
        checksum, name = line.split("  ")
        assert checksum == api["digest"]((output / name).read_bytes())
    assert evidence["packageSha256"] in (root / "summary").read_text()
    (installed / "package.json").write_text('{"version":"wrong"}')
    try:
        api["main"]()
    except ValueError:
        pass
    else:
        raise AssertionError("SDK mismatch accepted")
`);
});

test("broker packaging is dispatch-only, read-only and fails closed before publishing evidence", () => {
  assert.match(workflow, /on:\n  workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request_target:|secrets:|npm publish|id-token:|contents: write/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /timeout-minutes: 15/);
  assert.match(workflow, /persist-credentials: false/g);
  assert.match(workflow, /git merge-base --is-ancestor "\$SOURCE_SHA" refs\/remotes\/origin\/main/);
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$SOURCE_SHA"/);
  const install = workflow.indexOf("run: npm ci --ignore-scripts");
  const tests = workflow.indexOf("run: npm test");
  const pack = workflow.indexOf("npm pack --ignore-scripts");
  const verify = workflow.indexOf("run: python3 -I recipe/.github/scripts/broker-artifact.py");
  const upload = workflow.indexOf("uses: actions/upload-artifact@");
  assert.ok(install < tests && tests < pack && pack < verify && verify < upload);
  assert.match(workflow, /if-no-files-found: error/);
  assert.match(workflow, /retention-days: 14/);
  for (const action of workflow.matchAll(/uses: (actions\/[^\s]+)/g)) {
    assert.match(action[1], /@[0-9a-f]{40}$/);
  }
  const guard = workflow.match(/run: \|\n(\s+set -euo pipefail\n\s+\[\[ "\$SOURCE_SHA"[^\n]+)\n/)[1];
  for (const value of ["a".repeat(40), "main", "a".repeat(39), "A".repeat(40), "$(exit 0)", "a".repeat(40) + "\n"]) {
    const result = spawnSync("bash", ["-c", guard], {
      env: { PATH: process.env.PATH, SOURCE_SHA: value }, timeout: 5000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, value === "a".repeat(40) ? 0 : 1);
  }
});
