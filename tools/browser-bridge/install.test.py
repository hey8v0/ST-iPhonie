"""Check the distributed bundle and exercise its installer staging in isolation."""
import base64
from hashlib import sha256
from io import BytesIO
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest
from zipfile import ZipFile

SOURCE = Path(__file__).resolve().parent
INSTALLER = SOURCE / "ST-iPhonie-Browser-Phase2.sh"


class Installer(unittest.TestCase):
    def test_signing_validation_rejects_unsigned_and_corrupted_files(self):
        release = json.loads((SOURCE.parents[1] / "termux/browser-bridge/release.json").read_bytes())
        name = f"iPhonie-Browser-Bridge-{release['extension']}"
        original = SOURCE / (name + "-signed.xpi")
        command = [shutil.which("python") or "python", str(SOURCE / "build.py")]
        with tempfile.TemporaryDirectory(prefix="iphonie-signed-integrity-") as scratch:
            subprocess.run([*command, "--unsigned", "--output-dir", scratch], check=True)
            self.assertEqual(sha256(original.read_bytes()).hexdigest(), release["signedSha256"])
            unsigned = Path(scratch) / (name + ".xpi")
            corrupt = Path(scratch) / "corrupt.xpi"
            corrupt.write_bytes(original.read_bytes()[:-30])
            for asset in (unsigned, corrupt):
                result = subprocess.run([*command, "--verify-signed", "--signed", str(asset)], capture_output=True)
                self.assertNotEqual(result.returncode, 0)

    def test_payload_matches_source_and_xpi(self):
        script = INSTALLER.read_text("utf-8")
        payload = base64.b64decode(script.split("<<'IPH_PAYLOAD'\n")[1].split("\nIPH_PAYLOAD")[0])
        self.assertIn("sum=" + sha256(payload).hexdigest(), script)
        source = SOURCE.parents[1] / "termux/browser-bridge"
        with tarfile.open(fileobj=BytesIO(payload), mode="r:gz") as tar:
            self.assertTrue(all(m.isfile() and "/" != m.name[0] and ".." not in Path(m.name).parts for m in tar))
            for file in source.rglob("*"):
                if file.is_file():
                    name = file.relative_to(source).as_posix()
                    self.assertEqual(tar.extractfile(name).read(), file.read_bytes().replace(b"\r\n", b"\n"))
            release = json.loads(tar.extractfile("bundle-release.json").read())
            self.assertRegex(release.pop("frontend"), r"^[a-f0-9]{40}$")
            self.assertEqual(release, json.loads((source / "release.json").read_text("utf8")))
            original = (SOURCE / f"iPhonie-Browser-Bridge-{release['extension']}-signed.xpi").read_bytes()
            signed = tar.extractfile("iPhonie-Browser-Bridge-signed.xpi").read()
            self.assertEqual(signed, original)
            self.assertEqual(sha256(signed).hexdigest(), release["signedSha256"])
            with ZipFile(BytesIO(signed)) as xpi:
                manifest = json.loads(xpi.read("manifest.json"))
                self.assertEqual(manifest["browser_specific_settings"]["gecko"]["id"], "browser-bridge@st-iphonie.local")
                self.assertIn("nativeMessaging", manifest["permissions"])
                self.assertIn("META-INF/mozilla.rsa", xpi.namelist())
                self.assertEqual(sorted(name for name in xpi.namelist() if not name.startswith("META-INF/")),
                                 sorted(f.name for f in (source / "extension").iterdir()))

    @unittest.skipUnless(os.environ.get("STIP_TEST_BASH") or (os.name != "nt" and shutil.which("bash")),
                         "GNU Bash required; set STIP_TEST_BASH to Git Bash on Windows")
    def test_packages_twice_without_writing_into_tavern(self):
        bash = os.environ.get("STIP_TEST_BASH") or shutil.which("bash")
        with tempfile.TemporaryDirectory(prefix="ip-bridge-install-") as scratch:
            scratch = Path(scratch)
            # Only the packaging layer is under test. The Unix daemon and Android
            # interpreter are not assumed to run in the development host.
            run = subprocess.run([bash, "-c", """
                set -eu
                root="$(cd "$1" && pwd -P)"
                export HOME="$root/home" PREFIX="$root/prefix" PATH="$root/bin:$PATH"
                mkdir -p "$HOME/SillyTavern/extensions/ST-iPhonie/.git" "$PREFIX/bin" "$root/bin"
                printf 'existing data' > "$HOME/SillyTavern/extensions/ST-iPhonie/existing"
                mkdir -p "$HOME/.local/share/st-iphonie-browser/profile"
                printf 'existing profile' > "$HOME/.local/share/st-iphonie-browser/profile/cookies.sqlite"
                printf '#!/usr/bin/env bash\nexit 0\n' > "$PREFIX/bin/sh"
                printf '#!/usr/bin/env bash\n[[ "$1" == -e ]] || [[ -f "$1" && "$2" == install && "$3" == --plugin ]]\n' > "$root/bin/node"
                if ! command -v flock >/dev/null; then
                  printf '#!/usr/bin/env bash\nexit 0\n' > "$root/bin/flock"
                  chmod +x "$root/bin/flock"
                fi
                chmod +x "$PREFIX/bin/sh" "$root/bin/node"
                cd "$HOME/SillyTavern/extensions/ST-iPhonie"
                bash "$2"
                bash "$2"
                [[ $(cat existing) == 'existing data' ]]
                [[ $(find . -type f | wc -l) -eq 1 ]]
                [[ $(cat "$HOME/.local/share/st-iphonie-browser/profile/cookies.sqlite") == 'existing profile' ]]
                base="$HOME/.local/share/st-iphonie-bridge"
                [[ $(find "$base/bundles" -name iPhonie-Browser-Bridge-signed.xpi | wc -l) -eq 1 ]]
                [[ $(find "$base" -name '.install.*' | wc -l) -eq 0 ]]
            """, "packaging-test", scratch.as_posix(), INSTALLER.as_posix()],
                capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=30)
            self.assertEqual(run.returncode, 0, run.stderr + run.stdout)


if __name__ == "__main__":
    unittest.main()
