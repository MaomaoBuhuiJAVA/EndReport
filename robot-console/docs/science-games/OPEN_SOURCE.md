# 科学小游戏的开源来源

本模块使用 Matter.js 作为二维物理引擎，并参考 Matter Attractors 的 Basic 示例实现磁力操作台。这里移植的是开源物理示例中的运动与作用力思路，再适配本项目的触控、场景和游戏规则；不是将一款现成完整游戏换皮搬运。

## 已采用的基础

### Matter.js 0.20.0

- 仓库：https://github.com/liabru/matter-js
- 官方站点与示例：https://brm.io/matter-js/
- npm 元数据：https://registry.npmjs.org/matter-js/0.20.0
- 版本：`0.20.0`，核验时 npm latest 亦为 `0.20.0`。
- 该版本 npm `gitHead`：`acb99b6f8784c809b940f1d2cf745427e088e088`。
- 用途：刚体运动、碰撞、约束和力的计算。
- 原版权：`Copyright (c) Liam Brummitt and contributors.`
- 许可证：MIT，完整原文见 [licenses/matter-js-LICENSE.txt](licenses/matter-js-LICENSE.txt)。
- 上游许可证：https://github.com/liabru/matter-js/blob/master/LICENSE

Matter.js 的 [Mouse.js](https://github.com/liabru/matter-js/blob/master/src/core/Mouse.js) 包含 `touchstart`、`touchmove`、`touchend` 的单点触控处理。项目中的手机交互、触控区域、显示缩放、拖动规则与页面生命周期仍由本模块适配。

### Matter Attractors Basic 示例

- 仓库：https://github.com/liabru/matter-attractors
- 原始示例：https://github.com/liabru/matter-attractors/blob/master/docs/examples/basic.js
- 在线演示：https://liabru.github.io/matter-attractors/#basic
- 吸引力插件实现：https://github.com/liabru/matter-attractors/blob/master/index.js
- npm 元数据：https://registry.npmjs.org/matter-attractors/0.1.6
- 版本：`0.1.6`，核验时 npm latest 亦为 `0.1.6`，发布于 2017 年。
- 该版本 npm `gitHead`：`72b155b09602fbc51a23257cc7d22891cf8b676a`。
- 原版权：`Copyright (c) 2017 Liam Brummitt`。
- 许可证：MIT，完整原文见 [licenses/matter-attractors-LICENSE.txt](licenses/matter-attractors-LICENSE.txt)。
- 上游许可证：https://github.com/liabru/matter-attractors/blob/master/LICENSE

Basic 示例展示了“让一个吸引体跟随指针，并对周围刚体持续施加吸引力”的方法。磁力操作台将其适配为：移动磁铁、吸引指定铁质物体、约束吸附，拖到回收盘后松手收集。物品材质、目标、得分、释放与收集判断，以及网站界面均属于本项目的实现。

没有直接安装旧版 `matter-attractors` 插件。其 `index.js` 的兼容声明为 `matter-js@^0.12.0`，`package.json` 的开发依赖也为 `^0.12.0`，不能据此认定已验证兼容 Matter.js 0.20.0。本项目保留示例的吸引力思路，直接通过当前引擎的更新事件和 `Body.applyForce` 实现所需行为，避免引入旧插件的注册与 hook 层。即使不安装插件，参考和改写其示例仍保留该库的版权及完整 MIT 许可。

吸引力表现是为儿童操作设计的近似效果，不声称精确模拟磁场。铁质道具受到吸引；木质、塑料等道具不应仅因靠近磁铁而被吸附。

## 项目制作的部分

游戏页面布局、视觉样式、场景与道具图形、磁铁和物品的触控逻辑、收集目标、进度、积分及排行榜衔接由本项目实现。水槽的浮力和放入水中的交互为本项目制作，没有把未集成的其他开源演示计作已实现游戏。

影子工坊的点光源投影计算、三关目标与触控逻辑为本项目制作：从点光源向不透明球作两条切线，与竖直屏幕求交，以同一投影结果绘制遮挡区并检查目标匹配。该玩法没有引入额外开源游戏或光学引擎，不把它归为 Matter Attractors 示例。首页插画、头像及界面中的 SVG 图形亦为本项目制作；游戏场景主要使用 Canvas 和 CSS 绘制。

## 分发要求

MIT 允许使用、修改、合并、发布和商业使用。分发包含这些代码或其实质性部分的软件时，须保留原版权声明和完整许可文字；本目录的两份许可应随代码与交付包保留。MIT 不要求在儿童游戏画面持续显示署名，可在网站的关于或开源致谢页链接本说明。

上游代码的 MIT 许可不自动覆盖另行选取的图片、字体或音频；本模块使用的视觉素材应独立记录来源。

核验日期：2026-10-22。来源为上游原始文件与 npm 元数据。
