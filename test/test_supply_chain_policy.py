"""Native-manager probes against first-party, local-only package fixtures."""

import base64
import configparser
import datetime as dt
import hashlib
import http.server
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import threading
import tomllib
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NATIVE = ROOT / "policies/native"


def archive(files):
    result = io.BytesIO()
    with tarfile.open(fileobj=result, mode="w:gz") as tar:
        for name, content in files.items():
            data = content.encode()
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    return result.getvalue()


def wheel(version):
    result = io.BytesIO()
    prefix = f"policy_probe-{version}.dist-info/"
    with zipfile.ZipFile(result, "w") as output:
        output.writestr(prefix + "METADATA", f"Metadata-Version: 2.1\nName: policy-probe\nVersion: {version}\n")
        output.writestr(prefix + "WHEEL", "Wheel-Version: 1.0\nGenerator: fixture\nRoot-Is-Purelib: true\nTag: py3-none-any\n")
        output.writestr(prefix + "RECORD", "")
    return result.getvalue()


class PolicyFiles(unittest.TestCase):
    def test_native_units_and_script_controls(self):
        npm = configparser.ConfigParser()
        npm.read_string("[project]\n" + (ROOT / ".npmrc").read_text())
        self.assertEqual(npm["project"]["min-release-age"], "3")
        self.assertTrue(npm["project"].getboolean("ignore-scripts"))
        pnpm = (NATIVE / "pnpm-workspace.yaml").read_text()
        self.assertIn("minimumReleaseAge: 4320\n", pnpm)
        self.assertIn("ignoreScripts: true\n", pnpm)
        bun = tomllib.loads((NATIVE / "bunfig.toml").read_text())["install"]
        self.assertEqual(bun, {"minimumReleaseAge": 259200, "ignoreScripts": True})
        uv = tomllib.loads((NATIVE / "uv.toml").read_text())
        self.assertEqual(uv, {"exclude-newer": "P3D", "no-build": True})
        pip = configparser.ConfigParser()
        pip.read(NATIVE / "pip.conf")
        self.assertEqual(dict(pip["install"]), {"uploaded-prior-to": "P3D", "only-binary": ":all:"})

    def test_managed_skill_includes_standalone_native_settings(self):
        skill = (ROOT / "skills/workspace-supply-chain/SKILL.md").read_text()
        for path in [ROOT / ".npmrc", *NATIVE.iterdir()]:
            for line in path.read_text().splitlines():
                if line.strip() and not line.lstrip().startswith("#"):
                    self.assertIn(line, skill, str(path))
        self.assertNotIn("](../../", skill, "Installed skill must not depend on files outside its package")

    def test_no_broad_exemptions_and_explicit_dependabot_cooldown(self):
        for path in [ROOT / ".npmrc", *NATIVE.iterdir()]:
            content = "\n".join(line for line in path.read_text().splitlines() if not line.lstrip().startswith("#"))
            for exemption in ["minimumReleaseAgeExclude", "min-release-age-exclude", "trustedDependencies", "allowBuilds", "onlyBuiltDependencies", "exclude-newer-package"]:
                self.assertNotIn(exemption, content, str(path))
        dependabot = (ROOT / ".github/dependabot.yml").read_text()
        self.assertIn("package-ecosystem: github-actions", dependabot)
        self.assertIn("default-days: 3", dependabot)
        self.assertNotIn("target-branch", dependabot)


class NativeManagers(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.artifacts = {}
        cls.requests = []
        now = dt.datetime.now(dt.timezone.utc)
        cls.times = {
            "1.0.0": (now - dt.timedelta(days=10)).isoformat(),
            "2.0.0": (now - dt.timedelta(hours=1)).isoformat(),
        }
        for version in cls.times:
            manifest = {"name": "policy-probe", "version": version, "scripts": {"install": "node -e \"require('fs').writeFileSync('INSTALL_SCRIPT_RAN', 'fixture')\""}}
            cls.artifacts[f"/policy-probe-{version}.tgz"] = archive({"package/package.json": json.dumps(manifest)})
            cls.artifacts[f"/policy_probe-{version}-py3-none-any.whl"] = wheel(version)
        cls.artifacts["/source-probe-1.0.0.tar.gz"] = archive({
            "source-probe-1.0.0/setup.py": "from pathlib import Path\nPath('BUILD_SCRIPT_RAN').write_text('fixture')\nraise RuntimeError('Source build must not execute')\n",
        })

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_HEAD(self):
                self.do_GET()

            def do_GET(self):
                cls.requests.append(self.path)
                if self.path == "/policy-probe":
                    versions = {}
                    for version in cls.times:
                        path = f"/policy-probe-{version}.tgz"
                        versions[version] = {
                            "name": "policy-probe", "version": version,
                            "dist": {"tarball": cls.url + path, "integrity": "sha512-" + base64.b64encode(hashlib.sha512(cls.artifacts[path]).digest()).decode()},
                        }
                    body = json.dumps({"name": "policy-probe", "dist-tags": {"latest": "2.0.0"}, "time": cls.times, "versions": versions}).encode()
                    kind = "application/json"
                elif self.path in ["/simple/policy-probe/", "/simple/source-probe/"]:
                    files = []
                    for path, data in cls.artifacts.items():
                        if self.path == "/simple/policy-probe/" and path.endswith(".whl"):
                            version = path.split("-")[1]
                        elif self.path == "/simple/source-probe/" and path.endswith(".tar.gz"):
                            version = "1.0.0"
                        else:
                            continue
                        files.append({"filename": path[1:], "url": cls.url + path, "hashes": {"sha256": hashlib.sha256(data).hexdigest()}, "upload-time": cls.times[version]})
                    body = json.dumps({"meta": {"api-version": "1.0"}, "name": "policy-probe" if "policy-probe" in self.path else "source-probe", "files": files}).encode()
                    kind = "application/vnd.pypi.simple.v1+json"
                elif self.path in cls.artifacts:
                    body, kind = cls.artifacts[self.path], "application/octet-stream"
                else:
                    self.send_error(404)
                    return
                self.send_response(200)
                self.send_header("Content-Type", kind)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(body)

        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.url = f"http://127.0.0.1:{cls.server.server_port}"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="native-policy-")
        self.addCleanup(self.directory.cleanup)
        self.cwd = Path(self.directory.name)
        self.env = {key: value for key, value in os.environ.items() if key in ["PATH", "LANG", "SYSTEMROOT"]}
        self.env.update({"HOME": str(self.cwd / "home"), "NO_PROXY": "127.0.0.1,localhost", "CI": "true", "COREPACK_ENABLE_PROJECT_SPEC": "0"})

    def run_manager(self, *args, success=True):
        result = subprocess.run(args, cwd=self.cwd, env=self.env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=60)
        if success:
            self.assertEqual(result.returncode, 0, result.stdout)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout)
        return result.stdout

    def javascript_probe(self, manager):
        if not shutil.which(manager):
            self.skipTest(f"{manager} not installed; no native acceptance")
        if manager == "npm":
            output = self.run_manager("npm", "config", "ls", "-l")
            if "min-release-age =" not in output:
                self.skipTest("installed npm lacks min-release-age; no age acceptance")
            shutil.copyfile(ROOT / ".npmrc", self.cwd / ".npmrc")
            options = ["--package-lock=false", "--no-audit", "--no-fund", "--cache", str(self.cwd / "cache")]
        elif manager == "pnpm":
            shutil.copyfile(NATIVE / "pnpm-workspace.yaml", self.cwd / "pnpm-workspace.yaml")
            options = ["--store-dir", str(self.cwd / "store"), "--lockfile=false"]
        else:
            shutil.copyfile(NATIVE / "bunfig.toml", self.cwd / "bunfig.toml")
            options = []
        manifest = {"name": "fixture-project", "version": "1.0.0", "private": True, "dependencies": {"policy-probe": "*"}, "scripts": {"postinstall": "node -e \"require('fs').writeFileSync('PROJECT_SCRIPT_RAN', 'fixture')\""}}
        (self.cwd / "package.json").write_text(json.dumps(manifest))
        self.run_manager(manager, "install", "--registry", self.url, *options)
        installed = json.loads((self.cwd / "node_modules/policy-probe/package.json").read_text())
        self.assertEqual(installed["version"], "1.0.0")
        self.assertFalse(list(self.cwd.rglob("*_SCRIPT_RAN")), "Lifecycle script unexpectedly executed")
        manifest["dependencies"]["policy-probe"] = "2.0.0"
        (self.cwd / "package.json").write_text(json.dumps(manifest))
        self.run_manager(manager, "install", "--registry", self.url, *options, success=False)
        self.assertFalse(list(self.cwd.rglob("*_SCRIPT_RAN")))

    def test_npm_age_and_script_refusal(self):
        self.javascript_probe("npm")

    def test_pnpm_age_and_script_refusal(self):
        self.javascript_probe("pnpm")

    def test_bun_age_and_script_refusal(self):
        self.javascript_probe("bun")

    def test_uv_age_and_source_build_refusal(self):
        if not shutil.which("uv"):
            self.skipTest("uv not installed; no native acceptance")
        shutil.copyfile(NATIVE / "uv.toml", self.cwd / "uv.toml")
        args = ["uv", "--no-cache", "pip", "install", "--python", sys.executable, "--target", str(self.cwd / "site"), "--index-url", self.url + "/simple"]
        self.run_manager(*args, "policy-probe")
        self.assertTrue((self.cwd / "site/policy_probe-1.0.0.dist-info").exists())
        self.assertFalse((self.cwd / "site/policy_probe-2.0.0.dist-info").exists())
        self.run_manager(*args, "policy-probe==2.0.0", success=False)
        self.run_manager(*args, "source-probe", success=False)
        self.assertFalse(list(self.cwd.rglob("BUILD_SCRIPT_RAN")))

    def test_pip_wheel_only_source_refusal(self):
        if not shutil.which("pip"):
            self.skipTest("pip not installed; no native acceptance")
        # pip 24 cannot parse the newer age setting. Probe only its supported control.
        config = self.cwd / "pip.conf"
        config.write_text("[install]\nonly-binary = :all:\n")
        self.env["PIP_CONFIG_FILE"] = str(config)
        source = self.cwd / "source-probe-1.0.0.tar.gz"
        source.write_bytes(self.artifacts["/source-probe-1.0.0.tar.gz"])
        self.run_manager("pip", "install", "--disable-pip-version-check", "--no-cache-dir", "--no-index", "--find-links", str(self.cwd), "--target", str(self.cwd / "site"), "source-probe", success=False)
        self.assertFalse(list(self.cwd.rglob("BUILD_SCRIPT_RAN")))

    def test_pip_age_when_supported(self):
        if not shutil.which("pip"):
            self.skipTest("pip not installed; no native acceptance")
        version = self.run_manager("pip", "--version").split()[1]
        if tuple(int(part) for part in version.split(".")[:2]) < (26, 1):
            self.skipTest(f"pip {version} lacks relative uploaded-prior-to; use uv or a reviewed project-local pip upgrade")
        self.env["PIP_CONFIG_FILE"] = str(NATIVE / "pip.conf")
        args = ["pip", "install", "--disable-pip-version-check", "--no-cache-dir", "--index-url", self.url + "/simple", "--target", str(self.cwd / "site")]
        self.run_manager(*args, "policy-probe")
        self.assertTrue((self.cwd / "site/policy_probe-1.0.0.dist-info").exists())
        self.run_manager(*args, "policy-probe==2.0.0", success=False)


if __name__ == "__main__":
    unittest.main(verbosity=2)
