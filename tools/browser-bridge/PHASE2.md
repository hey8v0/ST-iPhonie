# 小手机浏览器 Phase 2 测试版

这次测试包的本机控制服务版本为 `0.2.4`，Mozilla 签名的 Firefox 扩展版本为 `0.2.2`，控制协议为 `v3`。安装包内的 `bundle-release.json` 记录配套前端提交、支持的服务和扩展版本、扩展 ID 与签名文件 SHA-256。Xvnc、Firefox Profile、noVNC 1.6.0 和画面密码沿用原来的 `iphonie-browser`。

[产品定稿](../../docs/browser/product-spec.txt) · [界面与交互规范](../../AGENTS.md) · [视觉规格模板](../../docs/browser/visual-spec-template.txt)

## 安卓安装与回退

已装好 Phase 1 或 Phase 2 的手机直接更新。在原来的 Termux 会话执行。

```sh
curl -fL https://raw.githubusercontent.com/hey8v0/ST-iPhonie/browser-phase2/tools/browser-bridge/ST-iPhonie-Browser-Phase2.sh -o "$HOME/iphonie-phase2.sh" && bash "$HOME/iphonie-phase2.sh"
```

脚本识别 `ST-iPhonie`、旧目录 `ST-TTS` 和旧 GitHub 地址 `hey8v0/ST-TTS`，也会检查酒馆的自定义数据目录。原分支和提交号记录在 Termux 实验目录。若有本地修改、未跟踪文件或找到多个插件目录，脚本保留当前工作区。若需手动指定，请把实际插件目录放在安装命令的 `--plugin` 后面。

```sh
bash "$HOME/iphonie-phase2.sh" --plugin "/你的插件目录/ST-TTS"
```

0.2.3 已装好签名版的手机更新后，刷新酒馆并直接连接浏览器，沿用签名扩展 0.2.2。下面步骤适用于仍需安装或迁移扩展的手机。

1. 刷新酒馆，打开「小手机 → 浏览器 → 更多 → 维修与更新」。已有配对沿用，提示时输入画面密码。
2. 点「安装签名扩展」，再在 Firefox 的权限提示中点「添加」。扩展会持久安装在 Firefox 当前 Profile，可在附加组件管理页停用或移除。
3. 点「回到浏览」。如果提示重启，点「打开重启页」，再点 Firefox 的「正常重启 / Restart normally」。重启后回到小手机；如果还留在维修页，再点一次「回到浏览」。
4. 以后用 `iphonie-bridge` 启动。安装中断时重跑同一包。回退用 `iphonie-bridge rollback`，然后刷新酒馆。回退恢复这次更新之前的前端与本机服务，扩展仍由 Firefox 管理。

维修画面独立监听本机回环 `6092`，沿用配对及 VNC 密码。它通过私有 X11 会话恢复 Firefox 工具栏。无法确认原窗口状态时，在同一个 Firefox Profile 中打开正常窗口并保留原窗口的标签页。维修过程中也可用「外部打开画面」进入原 noVNC。如果 Firefox 或 Xvnc 本身已经退出，用平时的启动命令恢复画面。

## 0.2.4 维修与降级浏览

- 画面和扩展控制通道正常时，即使独立维修服务暂未就绪，仍可导航、刷新和管理标签页。Firefox 原生工具栏继续可见。维修能力恢复后，从浏览器更多菜单点「重试隐藏 Firefox 工具栏」。
- 维修画面通过已认证的 RFB 会话请求 1024×768 的桌面尺寸，等待新画面后才开放安装按钮。竖屏和横屏都等比显示整个桌面。返回浏览后由正常浏览视图重新协商手机尺寸。
- 自动窗口操作优先使用 Firefox 的进程和窗口 PID，再在验证过的私有 Xvnc 上根据窗口类查找。Firefox 重启后若自身环境缺少显示设置，维修模块会用已验证的 Xvnc 的显示地址、授权文件和临时目录。若自动打开失败，重试按钮会提示确认当前 Firefox 地址栏，再通过已连接的画面发送固定页面所需的按键。
- 维修或正常浏览均可导出诊断。查看维修 HTTP、会话标记、Firefox/Profile、显示授权、窗口 PID 或 class、窗口管理器、激活、全屏检测、导航发送、退出结果及 RFB 尺寸事件。诊断仅记录状态，不含路径、网址、配对码或密码。

## Firefox 持久安装

Firefox 维护的 Profile 中必须同时找到原签名字节和相符的启用记录。控制服务还会验证经过身份认证的 Native Messaging 会话及握手版本。旧临时副本与签名版的版本相同。桌面实测，正常安装可以写入签名版，但原临时副本会优先在当前会话运行。Firefox 重启后会从 Profile 加载签名版。

Mozilla 支持通过 Firefox 应用分发目录下的 `policies.json` 配置 `ExtensionSettings` 及本地 `file:///…xpi`。其中 `normal_installed` 会进行托管安装，并可能随版本或文件更新重新安装。Windows 验证了应用目录中的 `distribution`。Termux 中该路径预计随实际 Firefox 可执行文件定位，尚须用真机的 `about:policies` 确认。本包采用 Firefox 普通安装权限提示，适用于已存在的独立 Profile。若地址栏未弹出提示，可在维修页打开 Firefox 附加组件管理，从齿轮菜单选择「从文件安装附加组件」，文件在 Termux 私有的 `$HOME/.local/share/st-iphonie-bridge/current/iPhonie-Browser-Bridge-signed.xpi`。 [Mozilla ExtensionSettings](https://firefox-admin-docs.mozilla.org/reference/policies/extensionsettings/)

## 维护签名与配套版本

- 原始源码在 `termux/browser-bridge/extension`。通过 `python tools/browser-bridge/build.py --unsigned` 生成开发用 XPI。Mozilla 提供的 [签名 XPI](./iPhonie-Browser-Bridge-0.2.2-signed.xpi) 单独保存，打包时按原始字节复制。
- 签名更新使用同一个 AMO 项目、相同的扩展 ID 和 `unlisted` 渠道。新版扩展必须提高版本号。准备好后，从 [AMO API 凭据页](https://addons.mozilla.org/en-US/developers/addon/api/key/) 生成 JWT 凭据，在 GitHub 仓库 `Settings → Environments → mozilla-amo` 添加 Secrets `AMO_JWT_ISSUER` 和 `AMO_JWT_SECRET`。手动工作流执行 lint、桥接测试、签名和源码校验，只上传签名 XPI 和校验值供维护者确认。 [web-ext sign 官方文档](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#web-ext-sign)
- 签名文件通过审核后，更新 `release.json` 的版本兼容范围和 SHA-256，保存原始签名文件，提交配套前端与服务。再执行 `python tools/browser-bridge/build.py --frontend <配套前端的完整提交号>` 生成测试包。首次启用 GitHub 工作流需让该工作流出现在仓库默认分支；本分支仅准备流程和候选版本。
- 0.2.2 的签名 manifest 不含 `update_url`。后续仍通过匹配测试包协调更新。在未来签名版本中采用自动更新前，需要设计可兼容预先部署服务的更新顺序。

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

## 0.2.1 诊断与技术边界

- 在本机合成测试里，改变 canvas 分辨率会清除像素，而布局事件曾直接触发这一过程。现在在布局稳定后合并请求，单独记录 Xvnc 的响应码，在相应尺寸的新像素完成绘制后移除短暂的上一帧。RFB 连接与 canvas 保持同一实例。
- 手机版以容器 CSS 宽度和实测渲染倍率计算远端像素。如果 Firefox 窗口维持大于 framebuffer 的最小宽度，则依据稳定测量扩大 framebuffer 并完整映射。Profile 历史缩放保留，可在更多菜单恢复当前页的 100%。实际 Firefox DPR 为 1 时仍受原始像素上限约束。
- 键盘遮挡检测使用宿主与当前页面可见区域的交集。键盘期间沿用横向映射，由远端调整可见高度，并按需把已确认编辑目标滚入视野。用户未继续滚动时，收起键盘会恢复这次辅助滚动。
- 扩展记录 navigator 的移动标识、触点数量和指针类别。手机版 HTTP UA 改写继续保留。桌面 Firefox 的 JavaScript UA 和触摸特征可能仍为桌面，站点还可能有自己的最小宽度。
- 使用「更多 → 导出诊断」获取最近 100 条事件。包含容器、iframe、canvas、framebuffer、Firefox 视口、缩放、resize 请求及回执、键盘和工具栏变化、焦点类型及 frame 编号。导出不包含输入值、网址、页面标题、密码、截图和配对码。复测闪屏或键盘空白后可直接导出。

## 开发环境结果

- Windows Firefox 161.0 使用真实扩展和 Windows 测试宿主完成导航、标签页、焦点、滚动、手机版和桌面版 HTTP UA、视频元素全屏识别和退出、窗口恢复及服务重连验证。
- 用真实 noVNC v1.6.0、回环 WS 和受控 RFB 测试服务，验证首帧、从 1024×1280 到 390×670 的实际尺寸协商、坐标映射和鉴权拒绝。安卓 Firefox 的最终 CSS 视口需真机测量。
- Chromium 用配套页面状态测试了 280、320、360、390 CSS px 下的首页、日夜和主题、沉浸释放高度、回车、标签页及中文组合事件。系统键盘自动唤起、真实触屏和视频音画留待安卓验收。
- 旧浏览器生命周期、compat2、分享卡片与现有搜索逻辑通过回归。安装包用隔离目录验证了重复安装和工作区保护。
