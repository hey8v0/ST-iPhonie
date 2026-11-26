#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
umask 077
base="$HOME/.local/share/st-iphonie-browser"
src="$(cd "$(dirname "$0")" && pwd)"
if ! command -v pkg >/dev/null || [[ ! -x /system/bin/getprop ]]; then
  echo '请在安卓 Termux 的新会话里运行。' >&2
  exit 1
fi
mkdir -p "$base/profile"
if [[ ! -f "$base/ready" ]]; then
  pkg install -y x11-repo
  pkg install -y firefox tigervnc xorg-xauth xorg-xdpyinfo pulseaudio git
  command -v npm >/dev/null || pkg install -y nodejs-lts
  if [[ ! -f "$base/viewer/vnc.html" ]]; then
    checkout="$(mktemp -d "$base/viewer.XXXXXX")"
    git clone --depth 1 --branch v1.6.0 https://github.com/novnc/noVNC.git "$checkout"
    # Serve only the viewer assets, keeping repository metadata outside the web root.
    mkdir -p "$base/viewer"
    cp -R "$checkout"/{app,core,vendor} "$base/viewer/"
    cp "$checkout/vnc.html" "$base/viewer/"
  fi
  npm install --prefix "$base" --ignore-scripts --no-audit --no-fund ws@8 sirv@3
  touch "$base/ready"
fi
export DISPLAY=:29 XAUTHORITY="$base/Xauthority"
if ! [[ -s "$base/passwd" ]]; then
  echo '设置本机画面的连接密码（VNC 使用前 8 个字符）。'
  vncpasswd "$base/passwd"
fi
if xdpyinfo >/dev/null 2>&1; then echo '显示器 :29 已在使用，请检查原来的 Termux 会话。'; exit 1; fi
touch "$XAUTHORITY"
xauth add "$DISPLAY" . "$(node -p "require('crypto').randomBytes(16).toString('hex')")"
pids=()
cleanup() {
  trap - EXIT
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || :; done
  wait || :
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP
Xvnc "$DISPLAY" -localhost -nolisten tcp -auth "$XAUTHORITY" -geometry 600x900 -depth 24 \
  -rfbport 5929 -SecurityTypes VncAuth -PasswordFile "$base/passwd" &
display_pid=$!
pids+=("$display_pid")
for ((i=0; i<50; i++)); do
  kill -0 "$display_pid" || exit 1
  if xdpyinfo >/dev/null 2>&1; then break; fi
  sleep .2
done
xdpyinfo >/dev/null
pulseaudio --start || echo '音频服务启动失败，本次可能没有声音。' >&2
firefox --no-remote --profile "$base/profile" --width 600 --height 900 https://m.bilibili.com/ &
pids+=("$!")
NODE_PATH="$base/node_modules" node "$src/bridge.cjs" "$base/viewer" &
pids+=("$!")
echo '打开小手机浏览器，点「连接本机 Firefox」。按 Ctrl+C 结束本次会话。'
wait -n
