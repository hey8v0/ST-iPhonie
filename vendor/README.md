# 视觉小说的模型库

角色用 VRM 或 Live2D 模型登场时才读这些文件（vn-model.js），平时不加载。

| 文件 | 用于 | 来源 | 授权 |
| --- | --- | --- | --- |
| `vrm.js` | VRM 0.x / 1.0 | [three.js](https://github.com/mrdoob/three.js) 0.186.1、[three-vrm](https://github.com/pixiv/three-vrm) 3.5.5（含读 .vrma 动作的 three-vrm-animation）打包成一个 ES 模块 | MIT |
| `live2d-4.js` | Live2D Cubism 3 / 4 | [pixi-live2d-display-lipsyncpatch](https://github.com/RaSan147/pixi-live2d-display) 0.5.0-ls-8 | MIT；里面的 Cubism Framework 按 [Live2D Open Software License](https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html) 再分发 |
| `live2d-2.js` | Live2D Cubism 2 | 同上 | MIT |
| `live2d-pixi.js` | 上面两个共用 | [PixiJS](https://github.com/pixijs/pixijs) 7.4.3 | MIT |

各自的授权全文见 `LICENSES.txt`。

Live2D 官方的运行核心不在这里：Cubism 3 / 4 的 `live2dcubismcore.min.js` 在用到时从 Live2D 官网（cubism.live2d.com）读，按 [Live2D Proprietary Software License](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html)；Cubism 2 的 `live2d.min.js` 官方已不再提供，从 jsDelivr 读固定版本，并校验文件哈希。

重新打包：见开发仓库的 `scripts/vendor/build.mjs`（Cubism 3/4 的遮罩缓冲按模型的遮罩数开够，超过 36 个遮罩的模型才画得对）。
