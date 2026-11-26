#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
umask 077
base="$HOME/.local/share/st-iphonie-browser"
backup="$base/browser-next-backup"
src="$(cd "$(dirname "$0")" && pwd)"
[[ -x "$PREFIX/bin/bash" ]] || { echo '请在安卓 Termux 中运行。'; exit 1; }
digest() {
  if [[ -f "$1" ]]; then sed 's/\r$//' "$1" | sha256sum | cut -d' ' -f1; else printf 'missing\n'; fi
}
replace() {
  local source="$1" dest="$2" temp
  mkdir -p "$(dirname "$dest")"
  temp="$(mktemp "$(dirname "$dest")/.iphonie-next.XXXXXX")"
  cp -- "$source" "$temp"
  mv -f -- "$temp" "$dest"
}
verify_path() {
  local root="$1" rel="$2" resolved
  resolved="$(realpath -m "$root/$rel")"
  [[ "$resolved" == "$root/$rel" && "$rel" =~ ^[a-zA-Z0-9._/-]+$ && "$rel" != *..* ]]
}
if [[ "${1:-}" == restore ]]; then
  [[ -f "$backup/location" ]] || { echo '未找到测试版安装记录。'; exit 1; }
  app="$(cat "$backup/location")"
  [[ "$app" == "$HOME"/* && -f "$app/manifest.json" ]] || exit 1
  while IFS=$'\t' read -r rel prior applied; do
    verify_path "$app" "$rel" || exit 1
    current="$(digest "$app/$rel")"
    [[ "$current" == "$applied" || "$current" == "$prior" ]] || { echo "文件有新的改动，保留当前文件：$rel"; exit 1; }
  done < "$backup/restore.tsv"
  while IFS=$'\t' read -r rel prior applied; do
    if [[ "$prior" == missing ]]; then
      if [[ -f "$app/$rel" ]]; then rm -- "$app/$rel"; fi
    else replace "$backup/original/$rel" "$app/$rel"; fi
  done < "$backup/restore.tsv"
  if [[ -f "$backup/server-location" ]]; then
    plugin="$(cat "$backup/server-location")"
    if [[ "$plugin" == "$HOME"/*/plugins/iphonie-web/index.mjs && "$(digest "$plugin")" == "$(cat "$backup/server-hash")" ]]; then
      rm -- "$plugin"
      echo '已移除试玩网页服务，重启酒馆后生效。'
    fi
  fi
  if [[ -f "$backup/launcher" ]]; then
    old="$(cat "$backup/launcher")"
    if [[ "$old" == "$base"/releases/*/launcher.sh && -f "$old" ]]; then
      ln -s "$old" "$base/previous-launcher.$$"
      mv -Tf "$base/previous-launcher.$$" "$PREFIX/bin/iphonie-browser"
    fi
  fi
  mv -- "$backup" "$backup.restored.$(date +%s)-$$"
  echo '已恢复原有小手机文件。刷新酒馆即可。'
  exit 0
fi

if [[ -f "$backup/location" ]]; then
  app="$(cat "$backup/location")"
else
  matches=()
  while IFS= read -r -d '' f; do
    if grep -Fq 'github.com/hey8v0/ST-iPhonie' "$f" && [[ -f "$(dirname "$f")/ui/browser.js" ]]; then
      matches+=("$(dirname "$f")")
    fi
  done < <(find "$HOME" \( -name node_modules -o -name .git -o -name .local -o -name .cache \) -prune -o -name manifest.json -type f -print0)
  (( ${#matches[@]} )) || { echo '未找到已安装的小手机。先从酒馆扩展管理安装正式版。'; exit 1; }
  if (( ${#matches[@]}>1 )); then
    PS3='选择要测试的小手机安装编号：'
    select app in "${matches[@]}"; do [[ -n "$app" ]] && break; done
  else app="${matches[0]}"; fi
fi
app="$(realpath "$app")"
[[ "$app" == "$HOME"/* && -f "$app/manifest.json" ]] || exit 1
while IFS=$'\t' read -r rel official alternate applied; do
  verify_path "$app" "$rel" || exit 1
  [[ "$(digest "$src/overlay/$rel")" == "$applied" ]] || { echo "安装包文件校验失败：$rel"; exit 1; }
  current="$(digest "$app/$rel")"
  [[ "$current" == "$official" || "$current" == "$alternate" || "$current" == "$applied" ]] || {
    echo "发现未识别的版本或自定义改动：$rel。已保留现有文件。"; exit 1;
  }
done < "$src/overlay.tsv"
if [[ ! -f "$backup/location" ]]; then
  mkdir -p "$backup/original"
  : > "$backup/restore.tsv"
  while IFS=$'\t' read -r rel official alternate applied; do
    saved="$(digest "$app/$rel")"
    if [[ "$saved" == "$alternate" && "$alternate" != "$official" ]]; then
      saved="$official"
      if [[ "$official" != missing ]]; then replace "$src/formal/$rel" "$backup/original/$rel"; fi
    elif [[ "$saved" != missing ]]; then
      replace "$app/$rel" "$backup/original/$rel"
    fi
    printf '%s\t%s\t%s\n' "$rel" "$saved" "$applied" >> "$backup/restore.tsv"
  done < "$src/overlay.tsv"
  printf '%s\n' "$app" > "$backup/location"
  if [[ -L "$PREFIX/bin/iphonie-browser" ]]; then
    readlink "$PREFIX/bin/iphonie-browser" > "$backup/launcher"
  fi
else
  cmp -s "$src/applied.tsv" "$backup/expected.tsv" || { echo '已有其他测试版，请先执行 iphonie-browser restore-release。'; exit 1; }
fi
cp "$src/applied.tsv" "$backup/expected.tsv"
while IFS=$'\t' read -r rel official alternate applied; do
  replace "$src/overlay/$rel" "$app/$rel"
done < "$src/overlay.tsv"
replace "$src/install-overlay.sh" "$base/restore-browser-next.sh"
# Locate a real SillyTavern root. Search runs as an optional server plugin.
tavern="$app"
while [[ "$tavern" == "$HOME"/* && ! -f "$tavern/src/plugin-loader.js" ]]; do tavern="$(dirname "$tavern")"; done
if [[ -f "$tavern/src/plugin-loader.js" ]]; then
  plugin="$tavern/plugins/iphonie-web/index.mjs"
  if verify_path "$tavern" 'plugins/iphonie-web/index.mjs' && [[ ! -e "$plugin" ]]; then
    echo '要安装可选的酒馆网页读取与 Brave 搜索组件吗？[y/N]'
    read -r install_server
    if [[ "$install_server" == [yY] ]]; then
      replace "$src/overlay/server/iphonie-web/index.mjs" "$plugin"
      printf '%s\n' "$plugin" > "$backup/server-location"
      digest "$plugin" > "$backup/server-hash"
      echo '网页服务已安装。酒馆需启用服务端插件并重启；浏览器和分享不依赖这项设置。'
    fi
  fi
fi
echo '小手机测试界面已更新，刷新酒馆后生效。恢复正式界面：iphonie-browser restore-release'
bash "$src/overlay/termux/browser.sh"

