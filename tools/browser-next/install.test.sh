#!/usr/bin/env bash
set -euo pipefail
source_root="$(cd "$(dirname "$0")/../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
export HOME="$tmp/home" PREFIX="$tmp/prefix" PATH="$tmp/bin:$PATH"
tavern="$HOME/SillyTavern"
app="$tavern/data/default-user/extensions/ST-iPhonie"
state="$HOME/.local/share/st-iphonie-browser"
mkdir -p "$app" "$PREFIX/bin" "$tmp/bin" "$tavern/src" "$state/profile"
ln -s "$(command -v bash)" "$PREFIX/bin/bash"
git -c safe.directory="$(cygpath -m "$source_root" 2>/dev/null || printf %s "$source_root")" -C "$source_root" archive 7ed20a6 -- core ui termux index.js host-chat.js host-pictures.js manifest.json | tar -x -C "$app"
cp "$app/ui/browser.js" "$tmp/formal-browser.js"
if [[ -n "${1:-}" ]]; then cp "$1"/preview/{browser.js,termux-connection.js} "$app/ui/"; fi
echo existing-tavern > "$tavern/start.sh"
echo existing-session > "$state/profile/cookies.sqlite"
echo existing-chat > "$tavern/data/default-user/chats.db"
touch "$tavern/src/plugin-loader.js"
mkdir -p "$state/releases/old"
echo old > "$state/releases/old/launcher.sh"
ln -s "$state/releases/old/launcher.sh" "$PREFIX/bin/iphonie-browser"
cat > "$tmp/bin/node" <<'NODE'
#!/usr/bin/env bash
[[ "${2:-}" != old-build ]]
NODE
touch "$tmp/bin/getprop" "$tmp/bin/pkg"
chmod +x "$tmp/bin/"*
if [[ "${2:-}" == upgrade ]]; then
  git -c safe.directory="$(cygpath -m "$source_root" 2>/dev/null || printf %s "$source_root")" -C "$source_root" show 783caa4:ST-iPhonie-Browser-Next.sh > "$tmp/previous.sh"
  printf 'y\n' | bash "$tmp/previous.sh"
  bash "$source_root/ST-iPhonie-Browser-Next.sh"
else
  printf 'y\n' | bash "$source_root/ST-iPhonie-Browser-Next.sh"
fi
test -f "$app/ui/browser-keyboard.js"
test -f "$tavern/plugins/iphonie-web/index.mjs"
test -f "$app/ui/web-share.js"
test -f "$app/termux/viewer-controls.js"
grep -Fq storyNaiRef "$app/ui/settings.js"
if [[ "${2:-}" != upgrade ]]; then bash "$source_root/ST-iPhonie-Browser-Next.sh"; fi
bash "$PREFIX/bin/iphonie-browser" restore-release
test ! -f "$app/ui/web-share.js"
test ! -f "$app/ui/termux-connection.js"
test ! -f "$app/ui/browser-keyboard.js"
cmp "$tmp/formal-browser.js" "$app/ui/browser.js" ||
  cmp <(sed 's/\r$//' "$tmp/formal-browser.js") "$app/ui/browser.js"
test ! -f "$tavern/plugins/iphonie-web/index.mjs"
grep -Fx existing-session "$state/profile/cookies.sqlite"
grep -Fx existing-tavern "$tavern/start.sh"
grep -Fx existing-chat "$tavern/data/default-user/chats.db"
test "$(readlink "$PREFIX/bin/iphonie-browser")" = "$state/releases/old/launcher.sh"
echo 'PASS signed-off baseline install, repeat, restore, app/profile/tavern data preserved'

