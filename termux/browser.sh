#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
umask 077
command -v getprop >/dev/null && command -v pkg >/dev/null || { echo '请在安卓 Termux 中执行。'; exit 1; }
base="$HOME/.local/share/st-iphonie-browser"
src="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$base/releases" "$base/profile"
files=(launcher.sh prepare.sh service.cjs bridge.cjs viewer-state.js viewer-bootstrap.js viewer-patch.cjs viewer-controls.js)
version="$(cd "$src" && sha256sum "${files[@]}" | sha256sum | cut -d' ' -f1)"
release="$base/releases/$version"
tmp="$(mktemp -d "$base/releases/install.XXXXXX")"
trap 'rm -rf -- "$tmp"' EXIT
for f in "${files[@]}"; do install -m 700 "$src/$f" "$tmp/$f"; done
if ! mv -T "$tmp" "$release" 2>/dev/null; then [[ -f "$release/service.cjs" ]] || exit 1; fi
if [[ -e "$PREFIX/bin/iphonie-browser" && ! -L "$PREFIX/bin/iphonie-browser" ]]; then
  echo '命令名已被其他程序使用，已保留原文件。'; exit 1
fi
if [[ -L "$PREFIX/bin/iphonie-browser" ]]; then
  old="$(readlink "$PREFIX/bin/iphonie-browser")"
  [[ "$old" == "$base"/releases/*/launcher.sh ]] || { echo '同名命令属于其他程序。'; exit 1; }
fi
ln -s "$release/launcher.sh" "$base/launcher.$$"
mv -Tf "$base/launcher.$$" "$PREFIX/bin/iphonie-browser"
bash "$release/launcher.sh" "$@"

