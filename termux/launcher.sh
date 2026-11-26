#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
umask 077
base="$HOME/.local/share/st-iphonie-browser"
src="$(dirname "$(readlink -f "$0")")"
export NODE_PATH="$base/node_modules"
echo '【小手机 · 本机浏览器】'
if ! command -v node >/dev/null; then
  read -r -p '需要安装 Termux 的 Node.js。允许安装吗？[y/N] ' ok
  [[ "$ok" == [yY] ]] || exit 1
  pkg install nodejs-lts
fi
if ! node -e "process.exit(typeof fetch === 'function' && typeof AbortSignal.timeout === 'function' ? 0 : 1)" 2>>"$base/install.log"; then
  echo 'Termux 的 Node.js 无法加载或版本过旧。请检查酒馆所用的 Node.js（需要 18 或以上）；详情见 install.log。'
  exit 1
fi
case "${1:-start}" in
restore-ui)
  backup="$base/preview-backup"
  [[ -f "$backup/location" ]] || { echo '当前没有试玩界面备份。'; exit 0; }
  ui="$(cat "$backup/location")"
  actual="$(sha256sum "$ui/browser.js" | cut -d' ' -f1)"
  [[ "$actual" == "$(cat "$backup/preview-hash")" ]] || { echo '界面已发生其他更新，已保留当前版本。'; exit 1; }
  temp="$(mktemp "$ui/.iphonie-restore.XXXXXX")"
  cp "$backup/browser.js" "$temp"; mv -f "$temp" "$ui/browser.js"
  if [[ -f "$backup/added-helper" && -f "$ui/termux-connection.js" ]]; then
    actual="$(sha256sum "$ui/termux-connection.js" | cut -d' ' -f1)"
    if [[ "$actual" == "$(cat "$backup/helper-hash")" ]]; then rm -- "$ui/termux-connection.js"; fi
  fi
  echo '原版连接界面已恢复。'
  ;;
start|repair)
  if node "$src/service.cjs" old-build; then
    read -r -p '检测到旧版浏览器服务仍在运行。仅重启小手机浏览器以应用兼容版？[y/N] ' ok
    [[ "$ok" == [yY] ]] || exit 1
    node "$src/service.cjs" stop
  fi
  if node "$src/service.cjs" reuse; then exit 0; fi
  if ! command -v flock >/dev/null; then
    read -r -p '需要安装 Termux 的 util-linux 以避免重复启动。允许安装吗？[y/N] ' ok
    [[ "$ok" == [yY] ]] || exit 1
    pkg install -y util-linux
  fi
  exec 9>"$base/install.lock"
  flock -w 90 9 || { echo '另一次安装仍在进行，请稍后重试。'; exit 1; }
  if node "$src/service.cjs" reuse; then exit 0; fi
  bash "$src/prepare.sh" "${1:-start}"
  # A detached service must not inherit the install lock.
  if ! node "$src/service.cjs" start 9>&-; then
    if [[ "${1:-start}" == start ]] && node "$src/service.cjs" needs-repair; then
      bash "$src/prepare.sh" repair
      node "$src/service.cjs" start 9>&-
    else exit 1; fi
  fi
  ;;
stop|status|diagnose|export) exec node "$src/service.cjs" "$1" ;;
*) echo '可用命令：iphonie-browser [start|stop|repair|status|diagnose|export]'; exit 1 ;;
esac

