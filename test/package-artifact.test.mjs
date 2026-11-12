import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const helper = fileURLToPath(new URL("../.github/scripts/broker-artifact.py", import.meta.url));
const workflow = readFileSync(new URL("../.github/workflows/package-github-broker.yml", import.meta.url), "utf8");
const discordWorkflow = readFileSync(new URL("../.github/workflows/package-discord-broker-dev.yml", import.meta.url), "utf8");
const fixture = `
import io, pathlib, runpy, sys, tarfile, tempfile
api = runpy.run_path(sys.argv[1])
with tempfile.TemporaryDirectory() as temp:
    root = pathlib.Path(temp).resolve()
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
  const temp = mkdtempSync(join(tmpdir(), "broker-artifact-test-"));
  const link = join(temp, "linked-temp");
  symlinkSync(temp, link, "dir");
  try {
    const result = spawnSync("python3", ["-I", "-c", fixture + body, helper], {
      encoding: "utf8", timeout: 10000, env: { ...process.env, TMPDIR: link },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const discordFixture = `
import io, pathlib, runpy, sys, tarfile, tempfile
api = runpy.run_path(sys.argv[1])
with tempfile.TemporaryDirectory() as temp:
    root = pathlib.Path(temp).resolve()
    package = root / "plugin"
    dist = package / "dist/plugins/discord-broker-dev/src"
    dist.mkdir(parents=True)
    for name in ("worker.js", "broker.js", "manifest.js"):
        (dist / name).write_text("export const fixture = true;\\n")
    for name in ("package.json", "README.md", "THREAT-MODEL.md", "ACCEPTANCE.md"):
        (package / name).write_text("{}\\n")
    files = api["package_files"](package, "discord-broker-dev")
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

function discordPython(body) {
  const temp = mkdtempSync(join(tmpdir(), "discord-broker-artifact-test-"));
  const link = join(temp, "linked-temp");
  symlinkSync(temp, link, "dir");
  try {
    const result = spawnSync("python3", ["-I", "-c", discordFixture + body, helper], {
      encoding: "utf8", timeout: 10000, env: { ...process.env, TMPDIR: link },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
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
    limits = api["verify_archive"].__globals__
    max_files, max_bytes = limits["MAX_FILES"], limits["MAX_BYTES"]
    limits["MAX_FILES"] = 1
    try:
        try:
            api["verify_archive"](archive(entries), files)
        except ValueError:
            pass
        else:
            raise AssertionError("unbounded members")
    finally:
        limits["MAX_FILES"] = max_files
    assert api["package_files"](package) == files
    limits["MAX_BYTES"] = 1
    try:
        try:
            api["package_files"](package)
        except ValueError:
            pass
        else:
            raise AssertionError("unbounded build files")
    finally:
        limits["MAX_BYTES"] = max_bytes
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

test("discord broker package evidence requires broker entry point and refuses unknown targets", () => {
  discordPython(`
    api["verify_archive"](archive(entries), files)
    assert len(files) == 7
    assert any(name.endswith("/broker.js") for name in files)
    try:
        api["package_files"](package, "discord-broker-prod")
    except ValueError:
        pass
    else:
        raise AssertionError("unknown target accepted")
    (dist / "broker.js").unlink()
    try:
        api["package_files"](package, "discord-broker-dev")
    except ValueError:
        pass
    else:
        raise AssertionError("missing broker entry point accepted")
    (dist / "broker.js").write_text("export const fixture = true;\\n")
    assert api["package_files"](package, "discord-broker-dev") == files
`);
});

test("broker target allowlist only names reviewed plugins", () => {
  python(`
    assert set(api["TARGETS"]) == {"github-broker", "discord-broker-dev"}
    try:
        api["package_files"](package, "../../escape")
    except ValueError:
        pass
    else:
        raise AssertionError("path traversal target accepted")
`);
});

test("discord broker packaging binds recipe, source, lockfile and SDK", () => {
  discordPython(`
    import json, os, shutil
    source, output = root / "source", root / "output"
    (source / "plugins").mkdir(parents=True)
    shutil.move(package, source / "plugins/discord-broker-dev")
    package = source / "plugins/discord-broker-dev"
    sdk = {"version": "2026.1023.0", "integrity": "sha512-synthetic", "resolved": "https://registry.npmjs.org/synthetic"}
    lock = json.dumps({"packages": {"node_modules/@paperclipai/plugin-sdk": sdk}})
    (source / "package-lock.json").write_text(lock)
    installed = source / "node_modules/@paperclipai/plugin-sdk"
    installed.mkdir(parents=True)
    (installed / "package.json").write_text(json.dumps({"version": sdk["version"]}))
    (package / "package.json").write_text(json.dumps({"dependencies": {"@paperclipai/plugin-sdk": sdk["version"]}}))
    files = api["package_files"](package, "discord-broker-dev")
    entries = [("package/" + name, data, tarfile.REGTYPE) for name, data in files.items()]
    output.mkdir()
    archive(entries).rename(output / "candidate.tgz")
    os.environ.update(SOURCE_SHA="a" * 40, RECIPE_SHA="b" * 40, GITHUB_RUN_ID="123", GITHUB_RUN_ATTEMPT="2", GITHUB_STEP_SUMMARY=str(root / "summary"), BROKER_TARGET="discord-broker-dev")
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
    assert evidence["brokerTarget"] == "discord-broker-dev"
    assert evidence["sourceSha"] == "a" * 40 and evidence["recipeSha"] == "b" * 40
    assert evidence["sourceTree"] == "c" * 40 and evidence["sdk"] == sdk
    manifest = json.loads((output / "dist-manifest.json").read_text())
    assert manifest == {name: api["digest"](data) for name, data in files.items() if name.startswith("dist/")}
    assert evidence["packageSha256"] in (root / "summary").read_text()
    os.environ["BROKER_TARGET"] = "unknown-target"
    try:
        api["main"]()
    except ValueError:
        pass
    else:
        raise AssertionError("unknown target in main accepted")
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
  const recipeTests = workflow.indexOf("run: node --test --test-timeout=10000 recipe/test/package-artifact.test.mjs");
  const install = workflow.indexOf("run: npm ci --ignore-scripts");
  const tests = workflow.indexOf("run: npm test");
  const pack = workflow.indexOf("npm pack --ignore-scripts");
  const verify = workflow.indexOf("run: python3 -I recipe/.github/scripts/broker-artifact.py");
  const upload = workflow.indexOf("uses: actions/upload-artifact@");
  assert.ok(recipeTests >= 0 && recipeTests < install && install < tests && tests < pack && pack < verify && verify < upload);
  assert.match(workflow, /if-no-files-found: error/);
  assert.match(workflow, /retention-days: 14/);
  for (const action of workflow.matchAll(/uses: (actions\/[^\s]+)/g)) {
    assert.match(action[1], /@[0-9a-f]{40}$/);
  }
  const approved = "9d99117038d4a2d90f9453e0d04e97d6070c652d";
  const diagnostics = "5e32d7ae9f7d057318229db6fcd5894d4b6bf3e4";
  const historical = "2b0c7cc97c6c515af7ed14e7c347a167b6bf0337";
  assert.match(workflow, new RegExp(`default: ${approved}`));
  assert.match(workflow, new RegExp(`options:\\n          - ${approved}\\n`));
  assert.match(workflow, new RegExp(`ref: ${approved}`));
  assert.ok(!workflow.includes(historical));
  assert.ok(!workflow.includes(diagnostics));
  assert.doesNotMatch(workflow, /ref: \$\{\{ inputs\.source_sha \}\}/);
  const guard = workflow.match(/run: \|\n([\s\S]*?)      - name: Check out packaging recipe/)[1];
  for (const value of [approved, diagnostics, historical, "a".repeat(40), "main", "a".repeat(39), "A".repeat(40), "$(exit 0)", approved + "\n"]) {
    const result = spawnSync("bash", ["-c", guard], {
      env: { PATH: process.env.PATH, SOURCE_SHA: value }, timeout: 5000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, value === approved ? 0 : 1);
  }
});

test("discord broker packaging mirrors the dispatch-only pinned recipe with discord target", () => {
  assert.match(discordWorkflow, /on:\n  workflow_dispatch:/);
  assert.doesNotMatch(discordWorkflow, /pull_request_target:|secrets:|npm publish|id-token:|contents: write/);
  assert.match(discordWorkflow, /permissions:\n  contents: read/);
  assert.match(discordWorkflow, /timeout-minutes: 15/);
  assert.match(discordWorkflow, /persist-credentials: false/g);
  assert.match(discordWorkflow, /git merge-base --is-ancestor "\$SOURCE_SHA" refs\/remotes\/origin\/main/);
  assert.match(discordWorkflow, /test "\$\(git rev-parse HEAD\)" = "\$SOURCE_SHA"/);
  const recipeTests = discordWorkflow.indexOf("run: node --test --test-timeout=10000 recipe/test/package-artifact.test.mjs");
  const install = discordWorkflow.indexOf("run: npm ci --ignore-scripts");
  const tests = discordWorkflow.indexOf("run: npm test");
  const pack = discordWorkflow.indexOf("npm pack --ignore-scripts");
  const verify = discordWorkflow.indexOf("run: python3 -I recipe/.github/scripts/broker-artifact.py");
  const upload = discordWorkflow.indexOf("uses: actions/upload-artifact@");
  assert.ok(recipeTests >= 0 && recipeTests < install && install < tests && tests < pack && pack < verify && verify < upload);
  assert.match(discordWorkflow, /working-directory: source\/plugins\/discord-broker-dev/);
  assert.match(discordWorkflow, /BROKER_TARGET: discord-broker-dev/);
  assert.match(discordWorkflow, /name: discord-broker-dev-\$\{\{ inputs\.source_sha \}\}/);
  assert.match(discordWorkflow, /if-no-files-found: error/);
  assert.match(discordWorkflow, /retention-days: 14/);
  for (const action of discordWorkflow.matchAll(/uses: (actions\/[^\s]+)/g)) {
    assert.match(action[1], /@[0-9a-f]{40}$/);
  }
  const approved = "4af09093d16e6ec5ec38c9f96fc30ecf7e39fbc3";
  const rejected = "1ef428d5948fe50c6df08525e787b08dcce4da38";
  assert.ok(!discordWorkflow.includes(rejected));
  assert.match(discordWorkflow, new RegExp(`default: ${approved}`));
  assert.match(discordWorkflow, new RegExp(`options:\\n          - ${approved}\\n`));
  assert.match(discordWorkflow, new RegExp(`ref: ${approved}`));
  assert.doesNotMatch(discordWorkflow, /ref: \$\{\{ inputs\.source_sha \}\}/);
  assert.ok(!discordWorkflow.includes("github-broker"));
  const guard = discordWorkflow.match(/run: \|\n([\s\S]*?)      - name: Check out packaging recipe/)[1];
  for (const value of [approved, rejected, "9d99117038d4a2d90f9453e0d04e97d6070c652d", "a".repeat(40), "main", "a".repeat(39), "A".repeat(40), "$(exit 0)", approved + "\n"]) {
    const result = spawnSync("bash", ["-c", guard], {
      env: { PATH: process.env.PATH, SOURCE_SHA: value }, timeout: 5000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, value === approved ? 0 : 1);
  }
});
