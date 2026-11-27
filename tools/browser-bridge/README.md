# Firefox 控制实验 · Phase 1

Phase 2 签名版安装和重启验证见 [Phase 2 测试说明](./PHASE2.md)。

实验包为 `0.1.0`，控制协议为 `v1`。源码在 `browser-bridge-poc`，基于 `browser-next` 的 `1f236e6`。实验组件独立运行。手机上的酒馆插件和原有本机 Firefox 服务无需切换分支或重新安装。

## 安卓验证

1. 在 Termux 安装并运行现有本机浏览器后，在同一个 Termux 会话执行以下命令。

   ```sh
   iphonie-browser
   curl -fL https://raw.githubusercontent.com/hey8v0/ST-iPhonie/browser-bridge-poc/tools/browser-bridge/ST-iPhonie-Browser-Bridge-POC.sh -o "$HOME/iphonie-bridge-poc.sh" && bash "$HOME/iphonie-bridge-poc.sh"
   ```

2. 在小手机原有浏览器里连接 **Termux Firefox**。在 Firefox 自己的地址栏打开 `about:debugging#/runtime/this-firefox`，选「临时载入附加组件」，在文件选择器中粘贴安装器输出的 XPI 完整路径。GTK 文件选择器可用 `Ctrl+L` 输入路径。
3. 回到 Termux 执行 `iphonie-bridge panel`。它用手机的系统浏览器打开本机面板。只有收到扩展握手及第一份有效标签页状态后才会显示「Firefox 扩展已连接」。建议用分屏或在系统浏览器和小手机之间切换来观察两边。
4. 用面板依次打开 `http://127.0.0.1:6091/fixture` 和一个普通网站，测试返回、前进和刷新。新建、切换、关闭标签页，再在小手机显示的 Firefox 中点测试页的普通输入、密码输入、多行输入和可编辑文本。面板只应显示输入类型、标签页及视口信息。输入自造的测试文字即可。
5. 在普通网页上按「隐藏 Firefox 工具栏」，再按「恢复工具栏」。分别观察网页尺寸、下载、登录新增窗口和网页视频全屏。若需要从 Firefox 直接恢复，使用它的退出全屏操作（可用 F11）。这一步测的是 Firefox 窗口全屏。
6. 在 Termux 执行 `iphonie-bridge stop`，确认面板显示断开，再运行 `iphonie-bridge` 并确认自动重连。重启 Firefox 会卸载临时扩展。重新载入 XPI 后，应收到新的握手与状态。

连接失败时，可在 Firefox 工具栏打开 **iPhonie Browser Bridge** 查看 Firefox 侧的简短状态，并运行 `iphonie-bridge diagnose`，或点面板的「导出诊断」。`hostInvoked` 表示安装以来宿主曾经被调用，`status` 和 `connections` 才反映当前控制服务观察到的通信。若系统浏览器没被唤起，运行 `iphonie-bridge url`，仅在自己手机上打开它输出的地址。

## 回退

在 Termux 执行 `iphonie-bridge rollback`，停止实验服务并撤销宿主注册与面板访问授权。在 `about:debugging` 移除临时扩展。恢复测试时重新执行上述安装命令。安装与回退都通过实验目录和清单工作，Firefox Profile、Cookie、收藏夹、登录、SillyTavern 工作区和原 6089 服务继续由原有组件管理。

## 现有架构审计

| 现有链路 | 审计结果 |
| --- | --- |
| `ui/browser.js`、`ui/browser.css` | 小手机保存自己的地址和历史。Firefox 走本机 iframe，页面导航状态与 Firefox 标签页分开。主题、全屏容器和连接 UI 可以在下一阶段复用。 |
| `ui/browser-keyboard.js`、`ui/termux-connection.js`、`termux/viewer-controls.js` | 连接当前基于健康接口及受限的父子 iframe 消息。现有导航和键盘主要通过 RFB 按键、剪贴板及焦点桥接；尺寸调整则走 noVNC 的远端尺寸协商。RFB 可继续承担画面与底层输入。 |
| `termux/bridge.cjs`、`termux/service.cjs` | 现有服务管理 Firefox、Openbox、Xvnc 和持久 Profile。画面服务使用回环端口 6089，VNC 使用回环端口 5929。HTTP 和 WebSocket 限制 Host 与来源，VNC 使用自己的密码校验。健康检查以进程和 X11 为主，避免周期性发起未认证 RFB。 |
| `termux/viewer-bootstrap.js`、`termux/viewer-patch.cjs` | 固定 noVNC v1.6.0，绕开可选 H.264 能力探测，读取实际认证和首帧。Phase 1 通过新增目录并行运行，原文件保留。 |
| `termux/prepare.sh`、`termux/launcher.sh` | 旧安装负责 ICU／字体依赖、已有服务复用和升级锁。实验包复用现有 Node.js 和 flock，只注册自己的宿主、独立快捷命令和版本目录。 |
| `ui/web-share.js`、`core/web-share.js`、`core/chats.js`、`host-chat.js`、`server/iphonie-web/index.mjs` | 已有网页卡片、显式分享、持久化及选用搜索 Provider 的流程。Phase 1 的控制通道和这些模块独立，后续可以用真实活动页替换猜测或剪贴板获取网址的路径。 |

## 控制通道

系统浏览器面板 → 回环 HTTP `127.0.0.1:6091` → Termux 实验服务 → 私有 Unix socket → Native Messaging 宿主 → Firefox WebExtension。

- 普通页面只运行隔离的顶层内容脚本，提供焦点类型及 CSS 视口尺寸。无输入值读取、无 Cookie 或页面正文接口。内部页面只显示类型及有限的地址标识。受保护的 HTTP(S) 页面以没有内容脚本应答为依据，面板显示为无法检查。子框架和封闭 Shadow DOM 的焦点仍待扩展。
- Native Messaging 清单只授权本扩展 ID。宿主使用 Termux 的绝对解释器路径，验证 Gecko 提供的参数，通过私有 socket 和独立随机令牌加入服务。面板走回环并核对 Host、Origin、随机令牌。令牌通过 URL 片段交给面板后从地址栏移除。Termux 同一 UID 下可以读其私有文件的脚本属于这一信任边界。所有控制指令必须通过类型、参数、目标标签页及版本校验。诊断仅包含状态、版本、计数及安装探测布尔值。
- 面板默认同步最后一个普通 Firefox 窗口，最多 64 张可见标签页记录。仅当前标签页返回 URL。浏览器命令以真实扩展响应为准，超时不自动重放。通信断开清除当前页面状态，扩展指数退避重连，避免频繁启动宿主。
- Termux 官方构建使用桌面 GTK 工具包并把目标按 Linux 处理。Gecko 源码把 GTK 归入 Linux，并查询用户及系统 Native Messaging 清单。Termux 补丁改写系统目录为 `$PREFIX/lib/mozilla`，用户目录按上游路径安装为 `$HOME/.mozilla/native-messaging-hosts`。这解释了实验的路径选择。真机仍需验证具体包版本是否能找到清单并执行脚本宿主。若失败，优先按 API 缺失、找不到清单、宿主未执行、socket 未握手区分；若设备构建无法使用 Native Messaging，再评估扩展主动拨号、双向认证的回环 WebSocket。

[Mozilla Native Messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging) · [Gecko 清单搜索实现](https://raw.githubusercontent.com/mozilla/gecko-dev/master/toolkit/components/extensions/NativeManifests.sys.mjs) · [Termux Firefox 构建参数](https://github.com/termux/termux-packages/blob/master/x11-packages/firefox/mozconfig.cfg) · [Termux 原生目录补丁](https://github.com/termux/termux-packages/blob/master/x11-packages/firefox/0027-prepend-prefix-to-nsXREDirProvider-absolute-paths.patch)

## 安装与窗口实验的边界

当前包带未签名 XPI，仅供临时加载。要验证 Firefox 重启后自动恢复，先用 Mozilla 账号登录 AMO Developer Hub，选择提交新扩展及自行分发，上传此版本的扩展 XPI。电脑上也可在 `termux/browser-bridge/extension` 执行 `npx web-ext build` 生成上传文件。下载通过签名的 XPI，再在 Firefox 的 `about:addons` 通过齿轮菜单「从文件安装附加组件」安装。需要延续同一个扩展 ID `browser-bridge@st-iphonie.local`。更新版递增扩展版本并配套同版本宿主服务。真机验证签名安装后，再决定如何纳入正式安装与更新。[临时安装](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/) · [Mozilla 提交扩展](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)

面板使用 `windows.update` 做可逆的 Firefox 窗口全屏实验，并尝试在控制通道断开时恢复原窗口状态。Windows 上用一次性 Profile 启动 Kiosk，网页加载成功，通过 WebDriver 显式临时装入扩展后仍可导航和开标签。Kiosk 会限制菜单及退出手势，用于真机前应先验证签名扩展的持久安装及恢复。紧凑密度只改变工具栏密度，实验保留原样。下载窗口、外部登录弹窗和视频播放器全屏仍需在 Xvnc 上观察。[Mozilla Kiosk 模式](https://support.mozilla.org/en-US/kb/firefox-enterprise-kiosk-mode)

面板报告 Firefox 内部 CSS 视口、可见视口、DPR 和缩放倍率。Xvnc framebuffer 的实际像素大小和 noVNC 画布缩放由现有画面链路独立决定。能读取这些数值是一项测量能力。它可为下一阶段对照容器宽度和调整显示尺寸提供依据。

## 构建与回归

```sh
python tools/browser-bridge/build.py
node --test tools/browser-bridge/bridge.test.cjs
python tools/browser-bridge/install.test.py
```

- Windows Firefox 161.0 使用临时 Profile、真实 XPI 和 Windows 测试宿主。已验证真实导航、标签页、CSS 视口、焦点、密码字段仅上报类型、窗口全屏与恢复，以及服务重启自动重连。Firefox 重启后移除了临时扩展，重新安装 XPI 后恢复。
- 自动测试通过 4 项协议／隐私测试、2 项安装包测试和 17 项原 browser-next 回归。安装包测试使用隔离目录和替代的系统命令验证解包、重复执行与工作区保护。
- 安卓真机验收仍需覆盖本机宿主路径和启动权限、签名扩展持久安装与重启、Xvnc 全屏及恢复、额外窗口、视频和不同 CPU／Android 版本。
