# GUI 系统设计文档（Canvas 2D 重写版）

> 对应旧代码 `DWinCtl.pas`（TDControl/TDButton/TDWindow/TDGrid/TDWinManager）
> 实现位置：`frontend/gui/`

---

## 1. 分层架构

客户端渲染分两层（用户决策）：

```
#stage（800×600）
├── #screen  <canvas>  游戏层：地图 + 人物/怪物/NPC/特效/掉落物（canvas 每帧轮询绘制）
└── #gui    <div>      GUI 层：多窗体（DOM div + img 背景，自研多窗体系统）
```

- **游戏层**：Canvas 2D，WIL → RGBA ImageData → 离屏 canvas → `drawImage`
- **GUI 层**：DOM 承载，`div` 窗体 + `img` 背景（懒加载），自研多窗体/拖动/置顶/模态

---

## 2. 类结构（照搬旧保留模式）

```
DControl     控件基类（div + img 背景 + 事件回调 + onInRealArea 不规则命中）
├── DButton   按钮（downed 按下态 + clickSound 音效类型）
│   └── DWindow  可拖动窗口（拖动/置顶/模态）
└── DGrid     网格（canvas 绘制格子，背包/交易格，hitCell 命中）
DWinManager  窗口管理器（事件分发 + z-index 管理 + 模态）
```

### 2.1 DControl（control.mjs）

| 成员 | 说明 |
|---|---|
| `el` | DOM div，`el.__control = this`（供 elementFromPoint 反向定位） |
| `bgImg` | 背景 img（懒加载） |
| `dParent` | 父控件（子控件 append 到父 el，相对定位） |
| `visible/enableFocus/background/caption` | 属性 |
| `left/top/width/height` | 位置尺寸（`setBounds`） |
| `onDirectPaint/onMouseDown/onMouseMove/onMouseUp/onClick/onInRealArea` | 事件回调 |
| `setFace(wlib, faceIndex)` | 懒加载背景图 |
| `addChild(child)` | 添加子控件 |

### 2.2 DButton（button.mjs）
- `downed` 按下状态、`clickSound` 音效类型（none/stone/glass/norm）

### 2.3 DWindow（window.mjs）
- 拖动：mousedown 记录偏移，全局 mousemove 更新位置，mouseup 结束
- 置顶：mousedown 时 `bringToFront()`（z-index 递增）
- 模态：`showModal()` 创建半透明遮罩 + 置顶

### 2.4 DGrid（grid.mjs）
- `setGrid(colCount, rowCount, colWidth, rowHeight)` 设置网格
- 用 canvas 绘制格子内容（`onGridPaint(col, row, ctx)`）
- `hitCell(lx, ly)` 命中格子 → `handleClick` → `onGridSelect(col, row)`

### 2.5 DWinManager（manager.mjs）
- `winList` 顶层控件列表、`_z` z-index 计数器
- `addDControl/delDControl` 管理控件
- `setModal/clearModal` 模态管理（遮罩层）
- 事件分发（UI 优先）：mousedown/mousemove/mouseup/keyDown/keyPress

---

## 3. 命中机制（关键）

用**浏览器原生 `elementFromPoint`** 反向定位命中控件（而非手写 z-index 排序遍历）：

```js
_hitTest(x, y) {
    const rect = this.container.getBoundingClientRect();
    const el = document.elementFromPoint(rect.left + x, rect.top + y);
    let node = el;
    while (node && node !== this.container) {
        if (node.__control) return node.__control;   // 找到控件
        node = node.parentElement;
    }
    return null;
}
```

优点：
- 自动处理 z-index、坐标（子控件相对父控件）、overflow:hidden 裁剪
- 透明区域命中由 `onInRealArea` 回调（在控件内做像素级判断）

坐标计算：事件相对命中控件的本地坐标用 `getBoundingClientRect` 差值（兼容子控件相对父定位）。

---

## 4. 背景图懒加载

控件背景图（`faceIndex` + `wlib`）支持懒加载，未加载时透明：

```
setFace(wlib, index)
  → wlib.getTexture(index)          // WIL 解析（异步，HTTP Range）
  → OffscreenCanvas convertToBlob   // 转 blob
  → URL.createObjectURL             // blob URL
  → bgImg.src = blobURL             // 显示
```

未加载完成时 `bgImg.src = ''`（透明占位），加载完成后下一帧显示。

---

## 5. 验证结果（Playwright 自动测试）

| 功能 | 结果 |
|---|---|
| 多窗体创建 | ✓ 2 个窗口 |
| 网格格子点击 | ✓ onGridSelect(2,1) 触发 |
| 按钮点击 | ✓ onClick 触发 |
| 窗口拖动 | ✓ 450→550 |
| 点击置顶 | ✓ z-index 101→104 |
| 背景图懒加载 | ✓ Prguse 图加载显示（石头窗框） |

---

## 6. 与旧代码对照

| 旧 Delphi | 新 JS | 说明 |
|---|---|---|
| TDControl | DControl | 保留模式控件基类 |
| TDButton | DButton | 按钮 |
| TDWindow | DWindow | 可拖动窗口 |
| TDGrid | DGrid | 网格 |
| TDWinManager | DWinManager | 窗口管理器 |
| OnInRealArea | onInRealArea | 不规则命中 |
| OnDirectPaint | onDirectPaint | 自绘回调 |
| MouseCaptureControl/FocusedControl/ModalDWindow | _mouseCapture/focusedControl/modalWindow | 全局状态 |

**差异**：旧代码全部画在 DirectX 表面，新代码 GUI 用 DOM、游戏层用 canvas 分层。命中从手写 z-index 遍历改为 elementFromPoint（更可靠）。
