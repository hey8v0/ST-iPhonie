# 安卓本机浏览器试玩

在运行酒馆的安卓手机上另开一个 Termux 会话。进入本文件所在目录，运行 `bash browser.sh`。第一次会下载 Firefox 和显示服务，并提示设置 VNC 密码。之后用同一条命令启动。

保留这个会话，在安卓系统浏览器中打开 `http://127.0.0.1:6089/vnc.html?autoconnect=1&resize=scale`，输入刚设置的密码。使用带试玩入口的插件时，也可以从本机酒馆的小手机浏览器点「连接本机 Firefox」。接下来在画面里的 Firefox 地址栏输入网址。触屏键盘可从画面左侧的 noVNC 抽屉唤起。

回到启动服务的 Termux 会话按 Ctrl+C，即可关闭本次 Firefox 和显示服务。下次启动会沿用独立的 Firefox 配置。声音由本机 PulseAudio 输出。视频流畅度、声音和后台运行需要在实际机型上测试。
