# 小手机浏览器 Phase 2 测试版

此分支基于安卓真机验收通过的 `browser-bridge-poc`。扩展和本机控制服务均为 `0.2.0`，协议为 `v2`。使用本分支同次交付的插件前端、脚本和 XPI。配套的 Xvnc、Firefox Profile、noVNC 1.6.0 及画面密码继续由原来的 `iphonie-browser` 管理。

[产品定稿](../../docs/browser/product-spec.txt) · [界面与交互规范](../../AGENTS.md) · [视觉规格模板](../../docs/browser/visual-spec-template.txt)

## 安卓安装与回退

在已完成 Phase 1 的 Termux 中，使用原来的会话执行。

```sh
iphonie-browser
curl -fL https://raw.githubusercontent.com/hey8v0/ST-iPhonie/browser-phase2/tools/browser-bridge/ST-iPhonie-Browser-Phase2.sh -o "$HOME/iphonie-phase2.sh" && bash "$HOME/iphonie-phase2.sh" --plugin
```

脚本通过 Git 将干净的插件目录切到实验提交。原分支和提交号记录在 Termux 实验目录。若发现本地修改、未跟踪文件或多个插件目录，脚本保留当前工作区。对于自定义安装位置，可在工作区干净后执行：

```sh
iphonie-bridge plugin "/你的插件目录/ST-iPhonie"
```

1. 刷新酒馆。在小手机浏览器中用「兼容连接」进入 Firefox，或从当前可用的旧浏览器进入 Firefox。
2. **开发验收**时，在 Firefox 里打开 `about:debugging#/runtime/this-firefox`。若仍列着 `0.1.0` 临时扩展，先移除它，再临时载入安装器给出的 `0.2.0` XPI。GTK 文件选择器可用 `Ctrl+L` 输入路径。
3. 执行 `iphonie-bridge pair`。在小手机的浏览器里选择连接，根据提示粘贴配对码，然后输入原有画面密码。配对码留在本机浏览器。之后执行 `iphonie-bridge` 即可启动或复用画面及控制服务。
4. 回退执行 `iphonie-bridge rollback`，随后刷新酒馆。脚本通过 Git 恢复原版本。有 Phase 1 安装记录时，控制服务入口会恢复到 Phase 1。原 Firefox 数据和画面服务入口可继续使用。移除 Phase 2 扩展或重新加载匹配的旧扩展即可。

## Mozilla 签名和持久安装

本分支的 [0.2.0 XPI](./iPhonie-Browser-Bridge-0.2.0.xpi) 是供 Mozilla 签名的提交文件。持久安装需要由具有该扩展所有权的 Mozilla 账号完成签名。临时扩展会在 Firefox 重启时卸载。

1. 在 Mozilla Add-ons Developer Hub 登录或注册，选择 **提交新扩展 → On your own（自行分发）**。选择桌面 Firefox，因为 Termux 运行的是桌面 Gecko。
2. 上传上述 XPI，扩展 ID 为 `browser-bridge@st-iphonie.local`。从 AMO 下载签名后的文件。后续版本由同一账号上传更新并递增版本号。
3. 把签名文件放到手机上，执行 `iphonie-bridge signed-addon "/签名文件的完整路径.xpi"`。命令将文件暂存到 Termux 私有目录并输出完整路径。
4. 在 Termux Firefox 里移除同 ID 的临时副本，打开 `about:addons`，用齿轮菜单「从文件安装附加组件」选择该文件，由 Firefox 校验签名和请求授权。重启 Firefox 后再检查是否自动连接。

这个测试包安装了前端版本、控制服务和本机宿主注册。签名 XPI 的 Firefox 安装确认仍需完成一次。签名文件和持久安装实测是正式分发的前置条件。 [Mozilla 提交流程](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)

## 重点验收

| 测试 | 观察点 |
| --- | --- |
| 首页和浏览 | 首页回车直接打开网址或搜索。浏览页底部依次为后退、前进、首页、标签页、更多。回到首页后可以继续同一会话。 |
| 沉浸 | 用一根手指连续向上滑，实际网页向下滚过阈值后顶部和底部会释放空间。反向滚动或从屏幕最上沿向下滑、最下沿向上滑可恢复。无滚动的页面可以从更多菜单手动隐藏。 |
| 视口和触点 | 分别在手机版、桌面版、竖屏和横屏导出诊断，比较容器、framebuffer、Firefox CSS 视口及 DPR。手机版应接近画面可用宽度，测试靠近四角的链接和视频进度条。Phase 1 的对照值为 1024×1280 CSS px、DPR 1。 |
| 输入 | 点网页文本框并用中文输入法选词。可从更多菜单的「打开键盘」主动唤起系统键盘。试输入 Emoji、退格、回车、粘贴，并在输入中切换标签页。键盘弹出前后比较页面文字尺寸。 |
| 视频 | 在网页播放器进入全屏，检查自动尝试横屏或手动旋转。用边缘手势退出后应恢复工具栏状态。另测声音、音画同步、进度条、后台再打开。Firefox 的音频继续走原有 Termux 音频路径。 |
| 标签页和失败恢复 | 试新建、切换、关闭单张、关闭其他及全部。再锁屏、回到酒馆、停止和重启控制服务，确认浏览数据及配对状态。 |

Firefox 扩展负责导航、标签页、按标签页保存桌面版选择、实际滚动和视口状态。自有画面客户端沿用 RFB 的触点映射及双指缩放，纵向单指滑动转为滚轮事件，横向拖动仍交给网页控件。桌面版页面会重新加载，使用桌面请求 UA 和更宽的远端 framebuffer。桌面 Gecko 的网页特性仍取决于网站，部分站点可能读取 JavaScript UA 或依赖原生触摸能力。

网页输入使用本地不可见代理。首次触碰到远端输入框与确认远端焦点之间存在异步往返，安卓宿主可能要求额外一次真实点击才打开软键盘。跨域 iframe 中的焦点和视频类型识别仍有限。屏幕方向锁也取决于宿主浏览器的全屏授权。遇到这些限制时，可用更多菜单的键盘入口或手动旋转手机。

## 开发环境结果

- Windows Firefox 161.0 使用真实扩展和 Windows 测试宿主完成导航、标签页、焦点、滚动、手机版和桌面版 HTTP UA、视频元素全屏识别和退出、窗口恢复及服务重连验证。
- 用真实 noVNC v1.6.0、回环 WS 和受控 RFB 测试服务，验证首帧、从 1024×1280 到 390×670 的实际尺寸协商、坐标映射和鉴权拒绝。安卓 Firefox 的最终 CSS 视口需真机测量。
- Chromium 用配套页面状态测试了 280、320、360、390 CSS px 下的首页、日夜和主题、沉浸释放高度、回车、标签页及中文组合事件。系统键盘自动唤起、真实触屏和视频音画留待安卓验收。
- 旧浏览器生命周期、compat2、分享卡片与现有搜索逻辑通过回归。安装包用隔离目录验证了重复安装和工作区保护。
