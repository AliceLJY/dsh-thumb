# dsh-thumb

给 DeepSeek Harness（dsh）网页版做的手机外壳。侧栏从「挤压聊天区」改成「覆盖式抽屉」，点会话自动收起，设置面板改全屏单列。桌面端一点不碰。

## 为什么需要它

dsh 的网页界面在手机上**首屏是正常的**——侧栏自动收成 56px 图标条，输入框完整。问题全在侧栏展开之后，而那正是手机上切会话的必经路径。

实测（iPhone 14 Pro 视口 393×660，dsh `0.1.0-rc.6`，装本插件之前）：

| 场景 | 改造前 | 改造后 |
|---|---|---|
| 收起态（图标条） | 正常 | **不介入**，原样 |
| 侧栏展开 | 侧栏占 71% 屏宽，**挤压**聊天区到 113px | 抽屉覆盖，聊天区 **393px 满宽** |
| 点会话之后 | 侧栏不收，一直卡在 113px 窄缝 | 自动收起 |
| 关闭抽屉 | 只能手动点收起按钮 | 点遮罩任意处即可 |
| 设置面板 | 800px 两列硬塞，英文逐词换行，选择器切出屏幕 | 全屏单列，导航横向滚动 |
| 设置面板被切元素 | 7 处 | 1 处 |

根因不是 bug，是上游的显式契约。`@deepseek-ai/dsh-client-ui-layout` 的列求解器注释写得很清楚：

> The sidebar never concedes: its rendered width is always the drag preference (or the collapsed rail), and **center absorbs any remaining deficit as the last resort**.

配合 `SIDEBAR_DEFAULT = 280`，在 393px 视口上算出来就是 `393 − 280 = 113`。让步链是「先缩详情栏 → 再关详情栏 → 最后中间栏吃掉全部亏空」。在窄的桌面窗口上这很合理（还剩几百 px），在手机上就不行了。

## 装 / 卸 / 临时关

```bash
# 装（profile 目录任意，--profile 指定即可）
dsh plugin --profile web add link:/absolute/path/to/dsh-thumb
# 确认 ~/.dsh/profiles/web/package.json 的 dsh.profile.bundles 里有 "dsh-thumb"，然后重启服务

# 卸
dsh plugin --profile web remove dsh-thumb
# 同样确认 bundles 数组里已移除，再重启
```

⚠️ **卸载/回滚要两件一起做**：`package.json` 和 `node_modules` 里的 link。只还原 `package.json` 的话，下次 `pnpm add` 会看到 link 还在、判定 "Already up to date"，**不写任何东西也不报错**——看起来装上了，实际没有。

临时关闭，不用重启服务：

- 地址后加 `?thumb=0`
- 或控制台 `localStorage.setItem('dsh-thumb','0')` 后刷新

## 它跟 GitHub 上那些同类插件的区别

同期社区有十几个 dsh 移动端项目，做同一件事的插件的通行写法是**在 CSS 里硬编码 dsh 的 class**（`pI_x6G_sidebarCol`、`Md3f7G_scroll` 这种）。那些 class 是 CSS Modules 构建时生成的，**dsh 每次重新构建就全变，插件随之静默失效**——样式不生效、页面还在、控制台不报错，你只会觉得"今天怎么又难用了"。

这里不放任何宿主 class 名。做法是运行时按**语义后缀**（`sidebarCol` 这半截来自上游源码的变量名，不随构建变）定位一次，给节点打上自己的 `data-thumb` 属性，样式表只认这些属性。上游要是真改了变量名，坏的是一个定位器，在一个地方、能直接查出来；不会变成满地样式无声失灵。

行为上也尽量走官方接口：关抽屉调的是 `ctx.layout.toggleSidebar()`（上游 `ILayout` 的公开方法，ui-sidebar 自己也用它），不是去模拟点击某个按钮。

## 作用域

**只在两个条件同时成立时才有任何效果**：视口 ≤1023px（对齐上游的 `SIDEBAR_AUTO_COLLAPSE = 1024`，避免两套断点打架）**且**侧栏被手动展开了。56px 图标条那个状态完全不碰——它本来就是好的。

桌面端已验证零变化：侧栏 280px、中间栏 1160px、`position: static`、无遮罩、设置面板仍是 800px 两列。

## 已知限制

- **hover tooltip 仍可能溢出右边缘**（悬停工作区行时那个黑色卡片）。有意不修：它的 class 语义（`_card` / `_copyable`）太泛，稳妥的修法得在每帧扫描所有 `position: fixed` 浮层再逐个夹回视口，误伤面不明，而它只是视觉瑕疵、不挡任何操作。真要修的话，正确入口是上游给 tooltip 加触屏判断，不是从外面兜。
- **只测过 iPhone 14 Pro 视口（393×660）与桌面 1440×900**。平板中间尺寸（768–1023px）走的是同一套抽屉逻辑，未实测——那个区间侧栏 280px 只占三分之一，原生表现本来就没那么糟，抽屉化未必是改善。真在 iPad 上用起来觉得别扭，把断点从 1023px 降到 767px 即可。
- **设置面板的导航项仍是竖排**，没有变成横向滚动条——那条 `flex-direction: row` 打在了一个并非真正承载这些项的容器上，结果是面板顶部多占一点垂直空间。有意不追：面板已经从「没法用」变成「能用」，再去精确定位那一层属于打磨不属于修复。
- **上游改了列布局的实现方式就得跟着改**。定位器在 `src/client.js` 顶部的 `LOCATORS`，四条，改起来是分钟级的事。

## 验证

改造前后各跑一遍同一套 Playwright 脚本，13 项断言（含桌面回归与关闭开关）。基线截图和复现方法在 `<local baseline folder — not published>`。

复现时会踩到的三个坑，一并记在这：

1. **ESM 不读 `NODE_PATH`** —— 全局装的 playwright 要用绝对路径引入，而且它是 CommonJS，得走 default import。
2. **Chrome 会吃系统代理**，`ts.net` 地址直接超时 —— 走 `http://127.0.0.1:3080` 加 `--no-proxy-server`。
3. **`waitUntil: 'networkidle'` 永远等不到** —— dsh 有常驻实时连接，用 `domcontentloaded` 加固定等待。

## 开发笔记

两个坑记在这里，因为都属于"看起来在别处、实际在自己身上"那类：

**插件不激活、整页白屏。** `package.json` 的 `dsh.client.inject` 和 `client.js` 导出的 `inject` 同名同形但语义不同：前者是**包名**（模块加载顺序），后者是 **cordis 服务名**（`['slots', 'layout']`）。把后者写成包名，插件会一直 pending，外壳报 `web boot: 1 entry did not activate`，而**整个页面渲染不出来**。参照 `@deepseek-ai/dsh-client-ui-sidebar` 的 `inject` 值就对了。

**永远关不掉的抽屉。** 判断抽屉是否展开，一开始读的是侧栏的渲染宽度（>56px 即展开）——而抽屉 CSS 恰恰把侧栏钉在 320px。**判据被自己的副作用污染**，于是它永远为真，收起按钮、遮罩、自动收起全部"失灵"，看起来像 `ctx.layout.toggleSidebar()` 在窄屏下不工作（它其实一直是好的）。现在读的是 AppFrame 写在 frame 上的 inline `grid-template-columns` 第一列——那是上游的意图，本插件不碰。**规矩：不要用一个自己会覆盖的量去做判据。**

## License

MIT
