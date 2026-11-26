"""Build an in-place Android test overlay and an independently restorable package."""
import base64
import hashlib
import io
import subprocess
import sys
import tarfile
from pathlib import Path

root = Path(__file__).resolve().parents[2]
output, compat = map(Path, sys.argv[1:3])
safe = f"safe.directory={root.as_posix()}"

def git(*args):
    return subprocess.check_output(["git", "-c", safe, *args], cwd=root)

base = "7ed20a6cf8ba69d51103e730f98b5a50bd27db79"
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
    compat_file = compat / "preview" / Path(rel).name
    is_compat_ui = rel in {"ui/browser.js", "ui/termux-connection.js"} and compat_file.is_file()
    alternate = normalized(compat_file.read_bytes()) if is_compat_ui else prior
    if is_compat_ui and prior is not None:
        new["formal/" + rel] = prior
    rows.append("\t".join([rel, digest(prior), digest(alternate), digest(content)]))
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

