# 传奇 MIR2 客户端精细分析文档（供重写参考）

> 源码位置：`/Volumes/未命名/fire/Source/Client`（Delphi 7 + DirectX 7）
> 组件库：`/Users/linxing/Documents/火炬源码+配套服务端/Component`（DelphiX 封装 DirectX、Fastnet 网络、Zura UI）
> 共享常量/协议：`/Volumes/未命名/fire/Source/Common/Grobal2.pas`
> 分析日期：2026-10

---

## 1. 概述

传奇客户端是一个 **800×600 全屏 DirectX 7 应用**，通过自定义 WIL 图片库 + DirectDraw 表面渲染 2D 纹理。整体分三大场景：

1. **登录场景**（含注册账号、改密码、选服务器）
2. **选择/创建角色场景**
3. **游玩场景**（地图、角色、怪物、战斗、聊天、背包、装备、交易、行会等）

核心特征：GUI 大量使用**透明自绘控件**——按钮等控件在绘制时调用 DirectX 绘制 2D 纹理（来自 WIL 文件），背景透明，用 `OnInRealArea` 回调做不规则形状命中判定。

---

## 2. 技术栈

| 层面 | 原技术 | 重写建议 |
|---|---|---|
| 语言 | Delphi 7 | TypeScript / JavaScript |
| 渲染 | DirectX 7（DirectDraw 表面） | WebGL / Canvas 2D（PIXI.js 已有） |
| 图形组件 | DelphiX（TDXDraw/TDxImage/TDirectDrawSurface） | PIXI.js Sprite/Texture |
| 网络 | TClientSocket（TCP）+ 6bit 编码 | WebSocket（现有服务端已支持） |
| 音频 | DirectSound（DXSound） | Web Audio / HTML5 Audio |
| 图像 | WIL/WIX 自定义 8 位调色板图库 | 已有 `frontend/image/WIL.mjs` 解析 |

---

## 3. 程序入口与生命周期

### 3.1 入口 `mir2.dpr`

```
program mir2;
  读取 .\mir.ini（启动参数）
  反外挂 FindHack.exe（BoUseFindHack）
  补丁检查 Patch.exe（BoNeedPatch）
  HasMMX 检测（无 MMX 拒绝运行）
  Application.CreateForm(TFrmMain, FrmMain)   // 主窗体
  Application.CreateForm(TFrmDlg, FrmDlg)     // 游戏 UI 窗体
  Application.CreateForm(TFrmConfirmDlg, FrmConfirmDlg) // 确认框
  FrmMain.InitializeClient
  Application.Run
```

### 3.2 三个窗体（二进制 DFM，`TPF0` 格式）

| 窗体 | 类 | 职责 |
|---|---|---|
| ClMain.dfm | `TFrmMain` | 主窗体，DirectX 绘制 + 网络 + 场景调度（BorderStyle=bsNone 全屏） |
| FState.dfm | `TFrmDlg` | 游戏内所有 UI 窗口（背包/装备/商店/交易/行会） |
| ConfirmDlg.dfm | `TFrmConfirmDlg` | 协议确认框（TPanel + TButton） |

### 3.3 主窗体 `TFrmMain` 组件（ClMain.dfm）

- `DXDraw1: TDXDraw`（DirectX 绘制，doFullScreen，800×600）
- `CSocket: TClientSocket`（网络，Port=7000）
- `DWinMan: TDWinManager`（UI 控件管理器）
- `Timer1`（网络泵）、`MouseTimer`、`WaitMsgTimer`、`SelChrWaitTimer`、`CmdTimer`、`MinTimer`
- `DXSound`（声音）
- **45 个 `TWMImages` 容器**（每个对应一个 .wil 文件，见 §5.3）

### 3.4 初始化流程 `InitializeClient`（ClMain.pas）

1. `DXDraw1.AutoInitialize := TRUE` → 触发 `DXDraw1Initialize`
2. 创建 Sound 引擎
3. `CSocket.Active := TRUE` 连接服务器
4. 挂 `Application.OnIdle := AppOnIdle`（主渲染循环）

`DXDraw1Initialize`（DirectX/WIL 加载，一次性）：
1. Surface 设为 800×600，设字体（楷体 9 号）
2. 给所有 WIL 容器赋 DDraw，依次 `.Initialize`（加载 WIL 头+调色板+索引）
3. 调色板：`DXDraw1.DefColorTable := WProgUse.MainPalette`
4. 加载/构建调色板最近索引（`Data\npal.idx`）
5. `DScreen.Initialize`、`PlayScene.Initialize`、`FrmDlg.Initialize`
6. 创建 `ImgMixSurface`（300×350）、`MiniMapSurface`（540×360）

---

## 4. 主循环（每帧渲染）

`Application.OnIdle → AppOnIdle`（ClMain）：

```
1. 若 DXDraw1.CanDraw 失败则退出
2. ProcessKeyMessages      （F1-F8 魔法快捷键）
3. ProcessActionMessages   （移动/攻击/施法寻路动作）
4. DScreen.DrawScreen(DxDraw1.Surface)   （画场景，含 PlayScene）
5. DWinMan.DirectPaint(DxDraw1.Surface)  （画 UI 控件层）
6. DScreen.DrawScreenTop                 （场景上层：系统消息）
7. DScreen.DrawHint                      （鼠标提示框）
8. 若 ItemMoving：画拖动中的物品图
9. 淡入淡出 DoFadeOut/DoFadeIn
10. DxDraw1.Primary.Draw(...)            （后台表面翻到主表面呈现）
```

网络消息处理在 `Timer1Timer`（独立于渲染循环）：把 `SocStr` 累积到 `BufferStr`，按 `#...!` 切帧，交给 `DecodeMessagePacket`。

---

## 5. 渲染系统

### 5.1 WIL 纹理格式（WIL.pas）

**文件对**：`xxx.wil`（图像数据）+ `xxx.wix`（索引表）

**WIL 头 `TWMImageHeaderEx`**：
```
VersionInfo: integer   // 校验 = (版本 + ImageCount) xor MagicCode
ImageCount:  integer   // 图片数量
```
- 版本：Korean=20020/20021、Taiwan=20030/20031、Chinese=20040/20041、English=20050/20051
- `WilMagicCode = $C02a1173`、`WixMagicCode = $B13a11F0`

**单图 `TWMImageInfoEx`**：
```
Width/Height: word
px/py: smallint   // 绘制偏移（相对锚点）
```

**调色板**：文件头后 256 × `TRgbQuad`（RGBQUAD），**8 位索引色**，索引 0 = 透明色。

**WIX 索引 `TWMIndexHeaderEx`**：IndexCount + 每图在 wil 里的偏移（4 字节数组）。

**加载流程**（懒加载 + 缓存）：
1. `Initialize`：读 WIL 头 → 校验版本 → 读调色板（`LoadPalette`）→ 读 WIX 索引（`LoadIndex`）
2. `GetCachedImage(index, px, py)`：若未加载则 `LoadDxImage`——Seek 到索引偏移，读图头，读 `Width*Height` 字节像素，按调色板建 8 位 DIB，`surface.TransparentColor := 0`
3. 缓存机制：`FreeOldMemorys` 每 10 秒检查，超过 5 分钟未用的 surface 释放

### 5.2 WIL 容器 ↔ 文件对照表（ClMain.dfm）

| 容器 | 文件 | 用途 |
|---|---|---|
| WTiles | Data\Tiles.wil | 大地砖 |
| WSmTiles | Data\SmTiles.wil | 小地砖 |
| WObjects1..7 | Data\Objects.wil / Objects2..7.wil | 地图对象 |
| WHumImg | Data\Hum.wil | 人物身体（每套衣服 600 帧） |
| WHairImg | Data\Hair.wil | 头发 |
| WWeapon | Data\Weapon.wil | 武器 |
| WMagic / WMagic2 | Data\Magic.wil / Magic2.wil | 魔法 |
| WMagIcon | Data\MagIcon.wil | 魔法图标 |
| WMonImg / WMon2..21Img | Data\Mon1..21.wil | 怪物 |
| WNpcImg | Data\Npc.wil | NPC |
| WEffectImg | Data\Effect.wil | 特效 |
| WProgUse / WProgUse2 | Data\Prguse.wil / Prguse2.wil | 界面素材 |
| WChrSel | Data\ChrSel.wil | 选人界面 |
| WMMap | Data\mmap.wil | 小地图 |
| WBagItem | Data\Items.wil | 背包物品图 |
| WStateItem | Data\StateItem.wil | 状态/装备栏图 |
| WDnItem | Data\DnItems.wil | 地面物品图 |

### 5.3 绘制流程 `TPlayScene.PlayScene`（PlayScn.pas，每帧）

**完整绘制顺序**：
1. 帧计时：每 100ms 走步帧切换（MoveStepCount 0/1），每 50ms `MainAniCount++`（地图对象动画帧）
2. 更新所有角色：`actor.ProcMsg → Move → Run → ProcHurryMsg`，处理换脸/删除
3. 更新特效：`GroundEffectList/EffectList/FlyList` 逐帧 Run
4. 清理远处对象（>30 格）
5. 视口计算 + 画地图瓦片（`DrawTileMap` 画大地砖+小地砖到 MapSurface，按 ShiftX/Y 平移拷贝到 ObjSurface）
6. 计算本帧全局偏移：`defx = -96 - ShiftX + 30`，`defy = -64 - ShiftY`
7. 画地面对象（48×32 标准地砖对象 + 地面特效）
8. 画高对象/混合对象，然后**按屏幕行 Y 深度排序**依次画：事件 → 地面物品 → 角色 → 飞行物
9. 光照收集（ViewFog 时）
10. 画玩家本体 + 选中目标（高亮混合）
11. 画角色特效 + EffectList 粒子特效
12. 地面物品闪烁（>5 秒，FLASHBASE=410 图片闪烁）
13. 最终合成（迷雾 DrawFog 或死亡灰度）
14. 小地图 DrawMiniMap

### 5.4 坐标换算公式（核心）

**cell → 屏幕**（`ScreenXYfromMCXY`）：
```
sx = (cx - Myself.Rx) * 48 + 388 - ShiftX
sy = (cy - Myself.Ry) * 32 + 208 - ShiftY
```
（UNITX=48 格宽，UNITY=32 格高；Rx/Ry 玩家格坐标；ShiftX/Y 亚像素偏移 0..47/0..31）

**屏幕 → cell**（`CXYfromMouseXY`）：
```
ccx = ceil((mx - 364 + ShiftX - 48) / 48) + Rx
ccy = ceil((my - 192 + ShiftY - 32) / 32) + Ry
```

**渲染偏移**：
```
defx = -96 - ShiftX + 30
defy = -64 - ShiftY
```

**视口滚动**：`Map.ClientRect` 以玩家为中心（左-9 右+9 上-9 下+8），MapSurface 取景框按 ShiftX/Y 平移。

### 5.5 光照迷雾系统

- 6 级光照贴图（`Data\lig0a.dat`~`lig0f.dat`），`TLightEffect{Width,Height,PFog}`
- `FogScreen` 800×445 亮度缓冲
- `AddLight` 累加光源亮度，`ApplyLightMap → DrawFog` 按亮度逐像素变暗
- 昼夜 `DayBright/DarkLevel/ViewFog`，`SM_DAYCHANGING` 更新

---

## 6. 场景系统（IntroScn.pas）

### 6.1 场景类型
```
stIntro 片头 / stLogin 登录 / stSelectCountry 选国家 / stSelectChr 选角色 /
stNewChr 建角色 / stLoading 加载 / stLoginNotice 公告 / stPlayGame 游玩
```

### 6.2 TScene 基类（虚方法）
```
Initialize / Finalize / OpenScene / CloseScene / OpeningScene /
KeyPress / KeyDown / MouseMove / MouseDown / PlayScene(MSurface)
```

### 6.3 场景子类
- `TIntroScene`：片头（空实现）
- `TLoginScene`：登录（EdId/EdPasswd + 注册 EdNewId/EdNewPasswd/EdConfirm/EdYourName/EdSSNo/EdBirthDay/EdQuiz1-2/EdAnswer1-2/EdPhone/EdMobPhone/EdEMail + 改密码 EdChgId 等），状态机 `lsLogin/lsNewid/lsNewidRetry/lsChgpw/lsCloseAll`
- `TSelectChrScene`：选角色（ChrArr[0..1] 两个槽，选/开始/新建/删除/退出），建角色（选职业/性别/发型）
- `TLoginNotice`：登录公告
- `TPlayScene`：游玩（见 §5.3）

---

## 7. UI 控件系统（DWinCtl.pas）

### 7.1 控件类层次（DirectDraw 自绘）
```
TDControl（基类，继承 TCustomControl）
├── TDButton（按钮）
│   └── TDWindow（窗口，Floating/ShowModal）
├── TDGrid（网格）
TDWinManager（窗口管理器）
```

### 7.2 核心机制（透明按钮）
- 每个控件有 `WLib`（WIL 容器）+ `FaceIndex`（外观图索引）
- `DirectPaint(dsurface)`：自绘（用 WIL 纹理画按钮外观）
- `OnInRealArea(x, y, var IsRealArea)`：不规则形状命中判定（透明区域不响应）
- `OnMouseMove/Down/Up/Click`：事件回调
- `OnDirectPaint`：自绘回调
- 全局状态：`MouseCaptureControl`（鼠标捕获）、`FocusedControl`（键盘焦点）、`ModalDWindow`（模态窗口）

### 7.3 事件分发（UI 优先于场景）
```
FormKeyDown → DWinMan.KeyDown（UI 消费则 exit）→ 游戏快捷键
DXDraw1MouseDown → DWinMan.MouseDown（UI 消费则 exit）→ 场景点击
```

---

## 8. 地图系统（MapUnit.pas）

### 8.1 数据结构
```
TMapHeader：Width/Height(2字节) + Title(20字节) + UpdateDate + Reserved
TMapInfo（每格 12 字节）：
  BkImg/MidImg/FrImg(各 2 字节，$8000 位=阻挡)
  DoorIndex(1字节，$80=门标志，$7F=门号)
  DoorOffset(1字节，$80=门开)
  AniFrame(1字节，$80=Alpha + 帧数)
  AniTick(1字节)
  Area(1字节，对象图库组)
  light(1字节，光源级)
```

### 8.2 碰撞检测
```
CanMove：BkImg & $8000 + FrImg & $8000 = 0 且（非门或门已开）
CanFly：FrImg & $8000 = 0
```

### 8.3 门系统
`GetDoor/IsDoorOpen/OpenDoor/CloseDoor`（门号匹配，±10 格范围开关）

---

## 9. 角色渲染（Actor.pas / AxeMon.pas / HerbActor.pas）

### 9.1 动作类型（SM_*，Grobal2.pas）
```
SM_TURN=10 转身 / SM_WALK=11 走 / SM_SITDOWN=12 坐 / SM_RUN=13 跑 /
SM_HIT=14 攻 / SM_HEAVYHIT=15 / SM_SPELL=17 施法 / SM_STRUCK=31 受击 /
SM_DEATH=32 死亡(冻结) / SM_NOWDEATH=34 死亡(播放) / SM_SKELETON=33 尸骨 /
SM_DIGUP=20 出土 / SM_DIGDOWN=21 钻地 / SM_FLYAXE=22 / SM_LIGHTING=23
```

### 9.2 8 方向常量
```
DR_UP=0 / DR_UPRIGHT=1 / DR_RIGHT=2 / DR_DOWNRIGHT=3 /
DR_DOWN=4 / DR_DOWNLEFT=5 / DR_LEFT=6 / DR_UPLEFT=7
```

### 9.3 帧动画核心公式
```
方向块起始帧 = 动作.start + Dir × (动作.frame + 动作.skip)
```
所有动作图按「8 方向 × N 帧」线性排列。

**人类动作表 HA**（每帧时长 ms）：
```
ActStand    start:0   frame:4 skip:4 ftime:200
ActWalk     start:64  frame:6 skip:2 ftime:90
ActRun      start:128 frame:6 skip:2 ftime:120
ActWarMode  start:192 frame:1 skip:0 ftime:200
ActHit      start:200 frame:6 skip:2 ftime:85
ActHeavyHit start:264 frame:6 skip:2 ftime:90
ActBigHit   start:328 frame:8 skip:0 ftime:70
ActSpell    start:392 frame:6 skip:2 ftime:60
ActSitdown  start:456 frame:2 skip:0 ftime:300
ActStruck   start:472 frame:3 skip:5 ftime:70
ActDie      start:536 frame:4 skip:4 ftime:120
```

**帧推进**：
- 非移动动作：`GetTickCount - starttime > frametime` 时 `currentframe+1`（可被消息积压 ×2/3、远端施法 ÷1.8 修正）
- 移动动作：每 tick `currentframe+1`，用 `Shift(Dir, step, cur, max)` 插值
- 待机：`currentdefframe` 每 500ms +1 循环

### 9.4 人类分层绘制（THumActor.DrawChr）
```
1. 武器后置（wpord=0，WORder[Sex,currentframe] 表决定）
2. 身体 BodySurface（颜色特效 + blend）
3. 头发 HairSurface
4. 武器前置（wpord=1）
5. 魔法盾泡泡（State & $00100000，MAGBUBBLEBASE=3890）
6. 施法特效 / 命中特效 / 武器特效
```
坐标：`dx + (px/hpx/wpx) + ShiftX`，`dy + (py/hpy/wpy) + ShiftY`
偏移：`BodyOffset = 600×衣服号`，`HairOffset = 600×(头发+性别)`，`WeaponOffset = 600×武器号`

### 9.5 怪物（TAxeMon）
- 外观 `Appearance` 决定图库偏移 `GetOffset(appr)` + 图库选择 `GetMonImg(appr)`
- 帧数：普通 280、高级 360、僵尸 430、雕塑 440
- 怪物动作段：ActStand/ActWalk/ActAttack/ActCritical/ActStruck/ActDie/ActDeath

### 9.6 颜色特效（State 位）
```
焦点/魔法目标=高亮  $80000000=中毒绿  $40000000=红  $20000000=蓝
$10000000=黄  $08000000=品红  $04000000=灰  $00800000=隐身(半透明 blend)
```

---

## 10. 特效系统（magiceff.pas）

### 10.1 特效类型
```
mtReady/mtFly/mtExplosion/mtFlyAxe/mtFireWind/mtFireGun/
mtLightingThunder/mtThunder/mtExploBujauk/mtBujaukGroundEffect/
mtKyulKai/mtFlyArrow/mtFireBall/mtGroundEffect/mtFireThunder
```

### 10.2 帧动画
- 循环型（飞行物）：`curframe` 循环
- 非循环：播放到末帧结束删除
- 飞行位置：`FlyXf += (firedisX/700)*ms`，命中判定后转为爆炸帧
- 10 秒超时自动删除

### 10.3 绘制
```
飞行：img = EffectBase + FLYBASE + Dir16*10 + curframe，DrawBlend
爆炸：img = EffectBase + EXPLOSIONBASE + curframe
```

### 10.4 事件（clEvent.pas）
地图事件：僵尸破土、碎石堆、圣幕、火焰、冰雕、心跳，每 20ms 递增帧。

---

## 11. 网络协议（ClMain.pas）

### 11.1 传输格式
**发送**：`'#' + 序号(1..9循环) + EncodeMessage(消息头) + 编码体 + '!'`
**接收**：按 `#...!` 切帧，`*` 为心跳（收到回 `*`）

**消息头 `TDefaultMessage`（12 字节）**：
```
Recog: integer(4)  // 对象识别号/版本号/金币数
Ident: word(2)     // 消息ID
Param: word(2)     // 参数1（X坐标/级别）
Tag:   word(2)     // 参数2（Y坐标/最大HP）
Series:word(2)     // 参数3（方向/效果号/伤害）
```

**编码**（EDCode.pas）：6bit 编码，每字节 → 6bit，字符值 +$3C，12 字节头 → 16 字符（DEFBLOCKSIZE）。

### 11.2 完整消息 ID

**客户端→服务端（CM_*）**：
```
CM_IDPASSWORD=2001 登录 / CM_ADDNEWUSER=2002 注册 / CM_CHANGEPASSWORD=2003 改密码
CM_QUERYCHR=100 查询角色 / CM_NEWCHR=101 建角色 / CM_DELCHR=102 删角色
CM_SELCHR=103 选角色 / CM_SELECTSERVER=104 选服务器
CM_QUERYUSERNAME=80 / CM_QUERYBAGITEMS=81 / CM_QUERYUSERSTATE=82 查看装备
CM_TURN=3010 / CM_WALK=3011 / CM_SITDOWN=3012 / CM_RUN=3013
CM_HIT=3014 / CM_HEAVYHIT=3015 / CM_BIGHIT=3016 / CM_SPELL=3017
CM_POWERHIT=3018 / CM_LONGHIT=3019 / CM_WIDEHIT=3024 / CM_FIREHIT=3025
CM_CROSSHIT=3035 / CM_SAY=3030
CM_DROPITEM=1000 / CM_PICKUP=1001 / CM_OPENDOOR=1002
CM_TAKEONITEM=1003 / CM_TAKEOFFITEM=1004 / CM_EAT=1006 / CM_BUTCH=1007
CM_MAGICKEYCHANGE=1008 / CM_SOFTCLOSE=1009 / CM_CLICKNPC=1010
CM_MERCHANTDLGSELECT=1011 / CM_USERSELLITEM=1013 / CM_USERBUYITEM=1014
CM_USERSTORAGEITEM=1031 / CM_USERTAKEBACKSTORAGEITEM=1032
CM_GROUPMODE=1019 / CM_CREATEGROUP=1020 / CM_ADDGROUPMEMBER=1021 / CM_DELGROUPMEMBER=1022
CM_DEALTRY=1025 / CM_DEALADDITEM=1026 / CM_DEALCHGGOLD=1029 / CM_DEALEND=1030
CM_WANTMINIMAP=1033 / CM_GUILD* =1035..1045
```

**服务端→客户端（SM_*）**（关键）：
```
SM_LOGON=50 进入游戏 / SM_NEWMAP=51 / SM_ABILITY=52 / SM_MAPDESCRIPTION=54
SM_SYSMESSAGE=100 / SM_CRY=102 / SM_WHISPER=103 / SM_GUILDMESSAGE=104
SM_ADDITEM=200 / SM_BAGITEMS=201 / SM_DELITEM=202 / SM_UPDATEITEM=203
SM_ADDMAGIC=210 / SM_SENDMYMAGIC=211 / SM_DELMAGIC=212
SM_VERSION_FAIL=501 / SM_PASSWD_FAIL=503 / SM_NEWID_SUCCESS=504 / SM_NEWID_FAIL=505
SM_QUERYCHR=520 / SM_STARTPLAY=525 选角成功(拿游戏服地址重连)
SM_DROPITEM_SUCCESS=600 / SM_ITEMSHOW=610 / SM_OPENDOOR_OK=612
SM_TAKEON_OK=615 / SM_SENDUSEITEMS=621
SM_CHANGEMAP=634 / SM_MAGICFIRE=638
SM_MERCHANTSAY=643 / SM_SENDGOODSLIST=645 / SM_BUYITEM_SUCCESS=650
SM_SENDUSERSTORAGEITEM=700 仓库 / SM_AREASTATE=708
SM_SENDUSERSTATE=751 查看装备 / SM_SUBABILITY=752
SM_DEALMENU=673 / SM_DEALSUCCESS=687 交易
SM_SENDNOTICE=658 公告 / SM_CHANGELIGHT=654 / SM_CHANGENAMECOLOR=656
```

### 11.3 连接流程（登录 → 进游戏）
```
SendLogin → SM_PASSOK_SELECTSERVER/SM_SELECTSERVER_OK → 拿认证
→ 重连角色服务器 → SendQueryChr → SM_QUERYCHR → 显示角色
→ SendSelChr → SM_STARTPLAY → 拿游戏服地址重连
→ SendRunLogin → SM_LOGON → 进入游戏场景 → 请求背包
```

---

## 12. 输入处理（ClMain.pas）

### 12.1 键盘分发
```
FormKeyDown → DWinMan.KeyDown（UI 优先）→ 游戏快捷键（F1-F8 魔法、F9 背包、F10 状态、F11 技能）
FormKeyPress → DWinMan.KeyPress → 聊天框 / 快捷键物品(数字1-6) / ESC关窗口
```

### 12.2 鼠标点击（`_DXDrawMouseDown`）
```
右键：Ctrl+右键查看玩家装备(CM_QUERYUSERSTATE)；近距转身；否则跑向目标
左键：
  1. 选中目标（GetAttackFocusCharacter）
  2. 锄头(Shape=19)挖矿
  3. Alt+左键：解剖尸体(CM_BUTCH)/坐下(CM_SITDOWN)
  4. 点商人→CM_CLICKNPC；点怪→攻击；点自己格→拾取(CM_PICKUP)
  5. 点空地→寻路（Ctrl 跑，否则走）
```

### 12.3 移动/攻击/施法发送
- 移动：`Myself.UpdateMsg(CM_WALK/CM_RUN, x, y, dir, ...)`
- 攻击：`Myself.SendMsg(CM_HIT/CM_HEAVYHIT/CM_FIREHIT/CM_POWERHIT/CM_WIDEHIT/CM_CROSSHIT/CM_LONGHIT, ...)`
- 施法：`SendSpellMsg(CM_SPELL, ...)` + `SM_MAGICFIRE`
- 动作锁：发动作时 `ActionLock:=TRUE`，收到 `+GOOD` 解锁，`+FAIL` 失败

---

## 13. 游戏 UI（FState.pas 的 TFrmDlg）

### 13.1 UI 窗口清单
- DBackground（背景，物品丢弃/金币丢弃）
- DStateWin（状态窗：装备纸娃娃/状态值/属性/魔法 4 页）
- DItemBag（背包：DItemGrid 网格 + 金币 + 修理）
- DBottom（底部栏：HP/MP/经验/负重条 + 聊天显示 + 饥饿度）
- DMerchantDlg（NPC 对话框，支持 `<C>` 居中、`<cmd/param>` 可点击命令）
- DMenuDlg（商店/仓库/炼药菜单）
- DSellDlg（出售/修理/托管）
- DDealDlg/DDealRemoteDlg（交易双方）
- DGuildDlg（行会）、DGroupDlg（组队）、DUserState1（查看他人装备）
- DAdjustAbility（属性加点）

### 13.2 背包数据模型
```
ItemArr[0..5]   底部 6 格快捷栏
ItemArr[6..45]  背包网格（DItemGrid，索引 = Col + Row*ColCount + 6）
ItemArr[46..51] 溢出区
```
物品图：`WBagItem.Images[Looks]`

### 13.3 拖放核心（MovingItem.Index 编码）
```
1..n    背包格子   -1..-13  装备槽（负值=-(槽+1)）
-97     交易金币   -98      背包金币   -99  出售槽
-20..-29 交易物品槽
```

### 13.4 装备穿戴 `GetTakeOnPosition(StdMode)`
```
5,6→武器  10,11→衣服  15,16→头盔  19,20,21→项链  22,23→戒指
24,26→手镯  30→勋章  25→护身符  54→腰带  52→靴子  53→宝石
```

---

## 14. 关键数据结构汇总

| 结构 | 字段 | 用途 |
|---|---|---|
| TDefaultMessage | Recog/Ident/Param/Tag/Series | 网络消息头（12 字节） |
| TMapInfo | BkImg/MidImg/FrImg/DoorIndex/DoorOffset/AniFrame/AniTick/Area/light | 地图格子（12 字节） |
| TWMImageInfoEx | Width/Height/px/py | WIL 单图信息 |
| TClientItem | S(TStdItem)/MakeIndex/Dura/DuraMax | 客户端物品 |
| TAbility | HP/MP/AC/MAC/DC/MC/SC | 能力值 |
| TUserCharacterInfo | 角色信息 | 选角色界面 |

---

## 15. 重写技术映射建议

### 15.1 渲染
- 用 PIXI.js（现有 `frontend/pixi.mjs` 已集成）
- WIL 解析已有 `frontend/image/WIL.mjs`、`M2Texture.mjs`
- DirectDraw Surface → PIXI.Texture
- 8 位调色板 → 转 RGBA（`frontend/SDK.mjs` 已有 Palletes）

### 15.2 场景
- TScene → JS 类，用场景管理器（现有 `frontend/scene/SceneManager.mjs`）
- PlayScene 已部分实现（`frontend/scene/PlayScene.mjs`），需按本文档补全渲染顺序、光照、特效

### 15.3 UI 控件
- TDWindow/TDButton/TDGrid → PIXI.Container + 交互事件
- OnInRealArea → 像素级命中（PIXI 的 alpha 通道判断）

### 15.4 网络
- 原 6bit 编码 + TDefaultMessage → 现有 WebSocket JSON 协议（服务端已实现）
- 消息 ID 已映射到 `frontend` 现有 JSON 消息类型

### 15.5 坐标/动画
- 坐标换算公式直接照搬（§5.4）
- 动画帧公式照搬（§9.3）：`方向块起始帧 = start + Dir × (frame + skip)`

### 15.6 音频
- DirectSound → HTML5 Audio（`frontend` 现有 wav 播放）

---

## 附：文件清单与规模

| 文件 | 行数 | 职责 |
|---|---|---|
| ClMain.pas | 6333 | 主窗体 + 网络 + 主循环 |
| FState.pas | 6404 | 游戏 UI 窗体 |
| Actor.pas | 3126 | 角色基类 |
| AxeMon.pas | 2166 | 怪物 |
| PlayScn.pas | 2057 | 游玩场景 |
| hutil32.pas | 2041 | 工具/绘图辅助 |
| IntroScn.pas | 1482 | 场景基类 + 登录/选角场景 |
| magiceff.pas | 1263 | 魔法特效 |
| cliUtil.pas | 1186 | 颜色/混合/雾 |
| DWinCtl.pas | 1124 | UI 控件 |
| WIL.pas | 822 | WIL 纹理 |
| HerbActor.pas | 778 | 草/植物/门/墙 |
| ClFunc.pas | 684 | 客户端函数（背包/交易/描边字） |
| MapUnit.pas | 503 | 地图 |
| DrawScrn.pas | 472 | 绘制屏幕（场景管理） |
| SoundUtil.pas | 248 | 声音 |
| clEvent.pas | 216 | 事件 |
| wmUtil.pas / EDCode.pas | 205×2 | 窗口消息 / 6bit 编码 |
| ButtonListBox.pas | 135 | 按钮列表 |
| ConfirmDlg.pas | 47 | 确认框 |
| **合计** | **约 31497 行** | |
