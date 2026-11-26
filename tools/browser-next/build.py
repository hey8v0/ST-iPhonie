"""Build an in-place Android test overlay and an independently restorable package."""
import base64
import hashlib
import io
import subprocess
import sys
import tarfile
from pathlib import Path

root = Path(__file__).resolve().parents[2]
output = Path(sys.argv[1])
safe = f"safe.directory={root.as_posix()}"

def git(*args):
    return subprocess.check_output(["git", "-c", safe, *args], cwd=root)

base = "7ed20a6cf8ba69d51103e730f98b5a50bd27db79"
compat_digests = {
    "ui/browser.js": "30460926708365b0fb2385c024498e620addb69b5fbec51e4396b021c8bf7dda",
    "ui/termux-connection.js": "a0b0d4c62f17c559e4d3dcbe9d151e56e5f7f47b324f920f581b0bad6be168d4",
}
def normalized(data):
    return data.replace(b"\r\n", b"\n")

def digest(data):
    return hashlib.sha256(data).hexdigest() if data is not None else "missing"

new = {}
base_names = set(git("ls-tree", "-r", "--name-only", base).decode().splitlines())
names = git("diff", "--name-only", base).decode().splitlines()
allowed = ("core/", "ui/", "termux/", "server/")
rows, applied = [], []
for rel in sorted(names):
    if not (rel.startswith(allowed) or rel.startswith("host-")):
        continue
    content = normalized((root / rel).read_bytes())
    prior = normalized(git("show", base + ":" + rel)) if rel in base_names else None
    alternate = compat_digests.get(rel, digest(prior))
    if rel in compat_digests and prior is not None:
        new["formal/" + rel] = prior
    rows.append("\t".join([rel, digest(prior), alternate, digest(content)]))
    applied.append(rel + "\t" + digest(content))
    new["overlay/" + rel] = content

new["overlay.tsv"] = ("\n".join(rows) + "\n").encode()
new["applied.tsv"] = ("\n".join(applied) + "\n").encode()
new["install-overlay.sh"] = normalized((Path(__file__).parent / "install-overlay.sh").read_bytes())
if not {"overlay/termux/browser.sh", "overlay/ui/browser.js", "overlay/server/iphonie-web/index.mjs"} <= new.keys():
    raise SystemExit("Missing test components. Commit all changed test files first.")
data = io.BytesIO()
with tarfile.open(fileobj=data, mode="w:gz") as archive:
    for name, content in new.items():
        item = tarfile.TarInfo(name)
        item.mode = 0o600
        item.size = len(content)
        archive.addfile(item, io.BytesIO(content))

header = b"""#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
umask 077
temp="$(mktemp -d)"
trap 'rm -rf -- "$temp"' EXIT
base64 -d <<'IPH_PAYLOAD' | tar -xz -C "$temp"
"""
output.write_bytes(header + base64.encodebytes(data.getvalue()) + b'IPH_PAYLOAD\nbash "$temp/install-overlay.sh"\n')
print(f'{output.name} · {len(rows)} files · {digest(output.read_bytes())}')

