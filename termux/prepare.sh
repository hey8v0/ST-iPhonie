#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
umask 077
base="$HOME/.local/share/st-iphonie-browser"
log="$base/install.log"
exec 3>&1
exec 2>>"$log"
trap 'echo "环境准备失败。运行 iphonie-browser diagnose 查看诊断。安装日志保存在 $log。" >&3' ERR
present() { [[ "$(dpkg-query -W -f='${Status}' "$1" 2>>"$log" || true)" == 'install ok installed' ]]; }
approve() {
  echo "$1"
  printf '允许修改这些 Termux 软件包吗？[y/N] ' >&3
  read -r answer
  [[ "$answer" == [yY] ]] || { echo '已取消，可以稍后再次启动。'; exit 1; }
}
echo '正在检查运行环境…'
packages=(x11-repo firefox libicu tigervnc openbox xorg-xauth xorg-xdpyinfo xdotool fontconfig fontconfig-utils pulseaudio git)
missing=()
for p in "${packages[@]}"; do present "$p" || missing+=("$p"); done
if (( ${#missing[@]} )); then
  approve "需要安装：${missing[*]}。包管理器会一并处理依赖。"
  if ! present x11-repo; then pkg install -y x11-repo >>"$log"; fi
  pkg install -y "${missing[@]}" >>"$log"
fi
if [[ "$1" == repair ]]; then
  approve '将重新安装 Firefox 与 libicu，以修复库缺失或版本不匹配。'
  apt-get install --no-remove --reinstall -y firefox libicu >>"$log"
fi
for cmd in firefox Xvnc openbox xauth xdpyinfo xdotool fc-match git node npm vncpasswd; do
  command -v "$cmd" >/dev/null || { echo "缺少命令：$cmd。请运行 iphonie-browser diagnose。" | tee -a "$log"; exit 1; }
done
font="$(fc-match -f '%{file}' sans-serif)"
if [[ ! -r "$font" ]]; then
  approve '未找到可读字体，将安装 DejaVu。'
  pkg install -y font-dejavu-ttf >>"$log"
  font="$(fc-match -f '%{file}' sans-serif)"
  [[ -r "$font" ]] || { echo '字体仍不可读，请导出诊断。'; exit 1; }
fi
assets=(vnc.html app/ui.js core/rfb.js vendor/pako/lib/zlib/inflate.js core/util/browser.js app/error-handler.js)
valid=true
for f in "${assets[@]}"; do [[ -s "$base/viewer/$f" ]] || valid=false; done
if [[ "$valid" == false ]]; then
  echo '正在安装本机画面组件…'
  tmp="$(mktemp -d "$base/novnc.XXXXXX")"
  trap 'rm -rf -- "$tmp"' EXIT
  git clone --quiet --depth 1 --branch v1.6.0 https://github.com/novnc/noVNC.git "$tmp/upstream" >>"$log"
  mkdir -p "$base/viewer"
  cp -R "$tmp/upstream"/{app,core,vendor,vnc.html,package.json,LICENSE.txt} "$base/viewer/"
fi
if ! node -e "require('ws');require('sirv')" >>"$log" 2>&1; then
  npm install --prefix "$base" --ignore-scripts --no-audit --no-fund ws@8 sirv@3 >>"$log"
fi
if [[ ! -s "$base/passwd" ]]; then
  echo '首次连接需设置画面密码（使用前 8 位），稍后在小手机内输入。'
  vncpasswd "$base/passwd.new" 2>&3
  mv "$base/passwd.new" "$base/passwd"
fi

