# 传奇客户端重写计划（Canvas 2D + ES Modules）

> 配套文档：`docs/CLIENT_ANALYSIS.md`（旧代码精细分析）
> 本文档在旧代码分析基础上，按以下技术决策细化重写方案。

---

## 0. 技术决策总览（已确认方向）

| 项 | 决策 |
|---|---|
| 语言 | JavaScript（ES Modules） |
| 渲染 | Canvas 2D（不用 WebGL），纯 `ImageData` + `drawImage` |
| 引擎 | 抛弃 PIXI.js，完全自研 |
| GUI | 自研轻量 GUI，照搬旧代码保留模式控件体系 |
| 主循环 | `requestAnimationFrame` 渲染 + 时间戳驱动逻辑（等价旧 OnIdle + Timer） |
| 网络 | WebSocket + 现有服务端 JSON 协议 |
| 纹理 | WIL 解析 → RGBA `ImageData` → 离屏 canvas 缓存（懒加载） |

**可借鉴但需重写的旧实现**（仅这两处，其余全部推倒）：
- `frontend/image/WIL.mjs` / `M2Texture.mjs` 的 WIL 解析算法
- `frontend/map/Maps.mjs` / `Map.mjs` 的 .map 解析算法
- HTTP Range 请求逻辑（`HttpServerHandler` 服务端已支持 Range）

**明确废弃**：PIXI.js 全部、`frontend/scene/`、`frontend/actor/`、创建/登录场景旧实现。

---

## 1. GUI 系统选型结论

### 1.1 调研结果
- `imgui-njs`（Dear ImGui JS 移植）：**即时模式**，与旧代码保留模式不匹配
- 通用 DOM GUI 库（W2UI/Webix/DatGUI）：面向 DOM 表格/表单，不适合 Canvas 游戏内嵌
- 无现成「Canvas 2D + 保留模式 + 多窗体 + WIL 纹理 + 透明不规则按钮」的开源库

### 1.2 结论：自研轻量 GUI（照搬旧代码）

理由：
1. 旧代码 `DWinCtl.pas`（1124 行）控件体系清晰，照搬符合「一比一移植」目标
2. 传奇 UI 特殊性（透明按钮 OnInRealArea 像素命中、WIL 纹理背景、游戏内嵌窗口）通用库不支持
3. 自研能精确支持**懒加载背景图**（用户核心需求）

### 1.3 GUI 类设计（照搬 DWinCtl）

```
DControl   （基类，对应 TDControl）
├── DButton（对应 TDButton）
│   └── DWindow（对应 TDWindow，可拖动/置顶/模态）
└── DGrid  （对应 TDGrid，背包/交易格子）
DWinManager（对应 TDWinManager，事件分发 + 绘制管理）
```

**核心字段**（照搬）：
- `wlib`（WIL 容器）、`faceIndex`（外观图索引）
- `visible`、`enableFocus`、`background`、`caption`
- `dParent`（父控件，相对坐标）
- `onDirectPaint`（自绘回调，canvas 绘制）
- `onInRealArea(x,y)`（不规则命中判定，透明区域不响应）
- `onMouseMove/onMouseDown/onMouseUp/onClick`
- 全局：`mouseCaptureControl`、`focusedControl`、`modalWindow`

**事件分发**（照搬，UI 优先于场景）：
```
keydown  → DWinManager.keyDown（UI 消费则 return）→ 游戏快捷键
mousedown → DWinManager.mouseDown（UI 消费则 return）→ 场景点击
```

### 1.4 控件背景图两种方式（用户要求）

控件外观（`directPaint` 或 `faceIndex`）支持两种来源，**统一走懒加载**：

1. **canvas 绘制**（`OffscreenCanvas`）：WIL 解析出的 RGBA 直接 `putImageData` 到离屏 canvas，缓存后 `drawImage`
2. **image 元素（base64 URL）**：先把 WIL 图转成 PNG base64 dataURL，创建 `<img>` 加载；适合需要浏览器缓存/缩放/复用 DOM 的场景

**懒加载机制**（照搬旧 `GetCachedImage`）：
- 初始：`faceIndex` 对应纹理未加载时，控件背景为**透明/空**（只画一个空占位）
- 加载：WIL 文件 HTTP Range 请求 → 解析像素 → 调色板转 RGBA → `putImageData` → 标记就绪
- 就绪后：下一帧 `directPaint` 时 `drawImage` 显示
- 释放：超过 N 分钟未使用则释放离屏 canvas（照搬 `FreeOldMemorys` 5 分钟）

---

## 2. 目录结构（全新，对应旧代码文件）

```
frontend/                          （整个重写，不参考旧实现）
├── index.html                     （canvas + script 入口）
├── main.mjs                       （入口，对应 mir2.dpr + ClMain 初始化）
│
├── core/
│   ├── loop.mjs                   （主循环，对应 OnIdle）
│   ├── input.mjs                  （键盘/鼠标事件，对应 FormKeyDown/MouseDown）
│   ├── net.mjs                    （WebSocket，对应 CSocket + Timer1 网络泵）
│   ├── config.mjs                 （常量：800×600、UNITX=48、UNITY=32 等）
│   └── global.mjs                 （全局单例：Myself/PlayScene/Map/各 WIL 容器）
│
├── gfx/
│   ├── wil.mjs                    （WIL/WIX 解析，对应 WIL.pas）
│   ├── texture.mjs                （ImageData + 离屏 canvas 缓存，懒加载）
│   ├── surface.mjs                （离屏画布：MapSurface/ObjSurface，对应 DDrawSurface）
│   ├── draw.mjs                   （描边字 BoldTextOut、混合 DrawBlend、颜色特效 DrawEffect）
│   └── color.mjs                  （调色板、颜色特效查表 BuildColorLevels）
│
├── gui/
│   ├── control.mjs                （DControl，对应 TDControl）
│   ├── button.mjs                 （DButton，对应 TDButton）
│   ├── window.mjs                 （DWindow，对应 TDWindow）
│   ├── grid.mjs                   （DGrid，对应 TDGrid）
│   └── manager.mjs                （DWinManager，对应 TDWinManager）
│
├── scene/
│   ├── scene.mjs                  （TScene 基类 + 场景类型）
│   ├── manager.mjs                （场景调度，对应 DrawScrn.pas）
│   ├── intro.mjs                  （片头）
│   ├── login.mjs                  （登录/注册/改密码，对应 TLoginScene）
│   ├── selectChr.mjs              （选角色/建角色，对应 TSelectChrScene）
│   └── play.mjs                   （游玩，对应 TPlayScene）
│
├── map/
│   └── map.mjs                    （地图加载/碰撞/门，对应 MapUnit.pas）
│
├── actor/
│   ├── actor.mjs                  （角色基类，对应 Actor.pas）
│   ├── humActor.mjs               （人物，分层绘制）
│   ├── monActor.mjs               （怪物，对应 AxeMon.pas）
│   ├── herbActor.mjs              （草/门/墙，对应 HerbActor.pas）
│   └── magicEff.mjs               （魔法特效，对应 magiceff.pas）
│
├── ui/
│   ├── frmDlg.mjs                 （游戏 UI 窗体，对应 FState.pas）
│   ├── bag.mjs                    （背包/装备拖放）
│   ├── chat.mjs                   （聊天输入/显示）
│   ├── shop.mjs                   （商店/仓库/修理）
│   ├── deal.mjs                   （交易）
│   └── guild.mjs                  （行会/组队）
│
├── net/
│   ├── protocol.mjs               （消息类型映射：旧 CM_/SM_ ↔ JSON）
│   └── codec.mjs                  （如需要二进制则 6bit 编码，否则 JSON）
│
└── util/
    ├── str.mjs                    （字符串/坐标工具，对应 hutil32 部分）
    └── sound.mjs                  （音频，对应 SoundUtil.pas）
```

---

## 3. 渲染架构（核心：ImageData 方案）

### 3.1 画布层次（对应旧代码三个表面）

```
主 canvas（800×600）                  ← 对应 DXDraw1.Primary（最终呈现）
├── 场景层：直接画地图/角色/特效      ← 对应 ObjSurface
│   └── 地图瓦片离屏 canvas（大图）    ← 对应 MapSurface（800+ 超大缓冲）
└── UI 层：DWinManager 绘制控件       ← 对应 DWinMan.DirectPaint
```

实现方式：一个主 canvas，每帧按顺序绘制：
1. 地图瓦片离屏 canvas（按 ShiftX/Y 平移 `drawImage` 取景框）
2. 场景对象/角色/特效（`drawImage` 各离屏纹理）
3. UI 控件层（DWinManager 遍历绘制）

### 3.2 纹理加载管线（WIL → 屏幕）

```
WIL 文件（HTTP Range 请求）
  → 解析 8 位索引色像素 + 256 色调色板
  → 转 RGBA（索引 0 = 透明）
  → ImageData（width×height）
  → putImageData 到离屏 canvas（OffscreenCanvas）
  → 缓存（texture.mjs 的 GetCachedImage）
  → 绘制时 ctx.drawImage(离屏canvas, x, y)
```

**关键**：纹理坐标带 `px/py` 偏移（WIL 单图信息），绘制时 `x + px`、`y + py`。

### 3.3 透明与混合
- 透明：索引 0 → alpha 0
- 混合（DrawBlend）：全局 `globalAlpha` + `globalCompositeOperation`
- 颜色特效（中毒绿/隐身半透明）：`getImageData` 逐像素改色（或预先建好颜色查表）

---

## 4. 主循环方案

### 4.1 渲染循环（等价 OnIdle）

用 `requestAnimationFrame`（浏览器标准 60fps，等价旧 OnIdle）。用户提到的「setTimeout 类似方式」本质是「定时驱动 + 照搬旧逻辑」，rAF 即浏览器优化的定时驱动。

```
function frame(timestamp) {
  1. 处理快捷键（ProcessKeyMessages）
  2. 处理移动/攻击寻路（ProcessActionMessages）
  3. 画场景（sceneManager.draw）
  4. 画 UI（winManager.draw）
  5. 画提示框
  6. 请求下一帧 rAF(frame)
}
```

### 4.2 逻辑定时器（等价 Timer1 / 各 Timer）

- 动画帧推进：用时间戳 `now - starttime > frametime` 判断（照搬旧 `GetTickCount` 逻辑）
- 网络泵：WebSocket `onmessage` 直接处理（等价 Timer1 累积 SocStr 切帧）
- 周期任务（血条超时、缓存释放）：在主循环里用时间戳判断

---

## 5. 网络方案

### 5.1 连接（等价 CSocket）

```
new WebSocket('ws://host/ws')
onopen    → 对应 CSocketConnect
onmessage → 对应 CSocketRead → DecodeMessagePacket
onerror/onclose → 对应 CSocketError/Disconnect
```

### 5.2 协议（现有服务端 JSON，非旧 6bit 编码）

现有服务端（`GameService.java`）已经是 JSON WebSocket 协议。客户端直接对接，**消息类型语义对齐旧 CM_/SM_**：

| 客户端 → 服务端（JSON type） | 旧 CM_ 语义 |
|---|---|
| `register/login` | CM_ADDNEWUSER / CM_IDPASSWORD |
| `createCharacter/enterGame` | CM_NEWCHR / CM_SELCHR + SM_LOGON |
| `move {dir}` | CM_WALK/CM_RUN |
| `attack {targetId}` | CM_HIT |
| `castMagic {magicId,targetId}` | CM_SPELL |
| `say {text}` | CM_SAY |
| `pickup/useItem` | CM_PICKUP / CM_EAT |
| `npcTalk/npcSelect` | CM_CLICKNPC / CM_MERCHANTDLGSELECT |

服务端已实现的全部消息类型（`GameService.java` 的 case），就是客户端要对接的完整协议。

> 注意：无需实现旧 6bit 编码，现有服务端不解析它。

---

## 6. 坐标 / 动画（照搬旧公式，不改动）

### 6.1 坐标换算（照搬 §5.4 分析文档）
```
cell → 屏幕：sx = (cx-Rx)*48 + 388 - ShiftX；sy = (cy-Ry)*32 + 208 - ShiftY
屏幕 → cell：ccx = ceil((mx-364+ShiftX-48)/48) + Rx
渲染偏移：defx = -96 - ShiftX + 30；defy = -64 - ShiftY
```

### 6.2 动画帧（照搬 §9.3）
```
方向块起始帧 = 动作.start + Dir × (动作.frame + 动作.skip)
待机帧推进：每 500ms currentdefframe+1
移动帧：每 tick currentframe+1，Shift(Dir, step, cur, max) 插值
```

### 6.3 动作/方向常量（照搬 Grobal2.pas）
- 8 方向 DR_UP=0 .. DR_UPLEFT=7
- 动作 SM_TURN=10/SM_WALK=11/SM_RUN=13/SM_HIT=14/SM_SPELL=17/SM_STRUCK=31/SM_DEATH=32

---

## 7. 分阶段实施计划

### 阶段 0：基础设施（可运行骨架）✅ 完成
- [x] `index.html` + `main.mjs` + `core/loop.mjs`（主循环）
- [x] `gfx/wil.mjs`（WIL 解析，借鉴旧算法）+ ImageData + 离屏 canvas 缓存 + 懒加载
- [x] HTTP Range 请求工具
- [x] 验证：加载 Tiles.wil 图片并显示到 canvas（11312 张图，Tiles[0]=96×64）

### 阶段 1：GUI 系统 ✅ 完成
- [x] `gui/control.mjs/button.mjs/window.mjs/grid.mjs/manager.mjs`
- [x] 事件分发（UI 优先）、多窗体拖动、点击置顶、模态对话框
- [x] 控件背景图懒加载（image blob URL）
- [x] 验证：Playwright 自动测试（网格点击/按钮/拖动/置顶全通过）
- 详细设计见 `docs/GUI_SYSTEM.md`

### 阶段 2：场景系统 + 登录
- [ ] `scene/scene.mjs`（TScene 基类）+ `scene/manager.mjs`
- [ ] `core/net.mjs`（WebSocket）+ `core/input.mjs`
- [ ] `scene/login.mjs`（登录窗口，用 GUI 系统）
- [ ] 验证：登录 → 进入游戏（对接现有服务端）

### 阶段 3：游玩场景（核心）
- [ ] `map/map.mjs`（地图加载/碰撞/门）
- [ ] `actor/actor.mjs`（角色基类 + 动画帧）
- [ ] `actor/humActor.mjs`（人物分层绘制：身体/头发/武器）
- [ ] `scene/play.mjs`（渲染流程：地图瓦片→对象→角色→特效，坐标换算）
- [ ] 验证：进游戏看到地图 + 自己 + 怪物，能移动

### 阶段 4：游戏 UI
- [ ] `ui/bag.mjs`（背包网格 + 拖放 + 装备穿戴）
- [ ] `ui/chat.mjs`（聊天输入/显示）
- [ ] `ui/frmDlg.mjs`（底部栏 HP/MP/经验/负重）
- [ ] 验证：打开背包、拖物品、装备、聊天

### 阶段 5：特效/商店/交易/行会
- [ ] `actor/magicEff.mjs`（魔法特效）
- [ ] `ui/shop.mjs`（商店/仓库/修理）
- [ ] `ui/deal.mjs`（交易）、`ui/guild.mjs`（行会/组队）
- [ ] 光照迷雾 + 小地图
- [ ] 验证：完整游戏循环

---

## 8. 待确认的问题（需要你拍板）

1. **GUI 库**：确认自研照搬（我的建议），还是坚持找开源（我会继续找，但目前无合适）
2. **主循环**：确认用 `requestAnimationFrame`（我的建议），还是严格用 `setTimeout(16ms)`
3. **目录**：直接在 `frontend/` 覆盖重写（删除旧实现），还是新建 `frontend2/` 并行开发、完成后切换
4. **纹理背景图**：默认两种都实现（canvas + image base64），还是先只做 canvas 一种
5. **实施起点**：是否从阶段 0 开始，还是先集中把 GUI 系统（阶段 1）打磨成熟
