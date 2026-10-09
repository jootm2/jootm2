# jootm2

传奇（Legend of Mir 2，热血传奇 1.80 风格）游戏的现代移植版。

**后端**：Java 11 + Netty + SQLite，单端口（8080）同时承载前端静态文件、REST API、WebSocket 游戏协议与资源服务。
**前端**：原生 Canvas 2D 等距渲染 + DOM GUI（ES Module，无框架依赖），界面与交互 1:1 复刻原版。

> 本项目是个人学习 / 怀旧项目，代码开放、**不商用**。资源文件（图片库 / 地图）因版权原因**不分发**，需自行准备（见下文「资源准备」）。

---

## 项目背景

老传奇（Mir 2）的服务端 / 客户端是 Delphi 编写。本项目：

- **后端**：将老 `M2Server` 的玩法子系统（地图 / NPC / 掉落 / 技能 / 战斗 / 任务 / 装备 / 行会 / 组队 / 仓库 / 交易等）逐一对齐移植到 Java + Netty + SQLite。
- **前端**：参照老 Delphi 客户端源码（`Actor.pas` / `PlayScn.pas` / `FState.pas` 等），用原生 Canvas 2D 重写等距地图渲染、实体 sprite、动作动画与游戏 GUI。

数据来源：模板数据由老 Delphi Paradox `.DB` 二进制转为 UTF-8 CSV；游戏脚本 / 配置沿用经典传奇服务端流传的文本配置。

## 已实现功能

### 后端（服务端）

- 账号注册 / 登录、角色创建 / 删除 / 选角（SQLite 持久化）
- 多地图 + 地图门 + 死亡复活 + 怪物重生
- NPC 系统（对话 / 脚本 `#IF/#ACT/#SAY` / 商店买卖 / 传送）
- 物品：掉落 / 拾取 / 使用 / 装备（药品、装备、技能书、祝福油、传送卷、卷包解包）
- 技能 / 魔法：伤害 / 治疗 / 推开 / 传送 / 隐身 / 护盾 / 毒 / 召唤宠物 / 群体增益
- 战斗：命中 / 敏捷判定、攻击模式、战士技能开关 / 蓄力、法师 / 道士按目标类型执行不同操作
- 任务系统（MapQuest）、装备特殊属性 + 套装（麻痹 / 传送 / 复活 / 护身 / 吸血 / 幸运）
- 行会 + 攻城、组队、仓库、交易、祝福油、行会战

### 前端（客户端）

- 登录 / 注册 / 改密码 / 选角 / 建角界面（1:1 复刻原版）
- 等距地图渲染（真实 `.map` 栅格 + 对象光效 + 平滑卷动）
- 实体真实 sprite（怪物 / NPC / 玩家，动作表 1:1 移植）
- 行走 / 攻击 / 施法 / 受击 / 死亡动画
- 点击交互（点地走 / 点怪攻击 / 点 NPC 对话 / 点物拾取）
- 背包 / 装备 / 属性 / 技能窗口 + NPC 对话框 + 买卖界面
- 技能系统（F1-F8 施法 + 快捷键设置 + 特效渲染：飞行 / 命中 / 火墙 / 自身光环 / 传送现身 / 魔法盾 / 飘字，特效帧号 1:1 对齐原版）
- 传送卷 / 卷包解包 / 消耗品使用

更完整的实现细节与「已发现的坑」见 [`HANDOFF.md`](HANDOFF.md)。

---

## 快速开始

### 环境要求

- JDK 11+
- Maven 3.6+

### 构建与运行

```bash
mvn -q -DskipTests package
java -jar target/jootm2.jar
```

启动后访问 http://localhost:8080/ 即可注册 → 登录 → 建角色 → 进入游戏。

> 建议在项目根目录运行。若从其他目录运行，程序会自动向上定位 `frontend` / `gamedata` / `resources`；`config/server.properties` 缺失时回退到内置默认值。

---

## 资源准备（重要）

本项目**不包含**以下两类资源文件（版权原因，请自行准备）：

### 1. 客户端渲染资源（`resources/`）

需要 `Data/`（WIL 图片库）、`Map/`、`Wav/`（音效）。自行下载 **热血传奇 1.80 客户端**，安装后把其目录软链到 `resources/`：

```bash
ln -s "/你的热血传奇客户端安装目录" resources
```

### 2. 地图栅格（`gamedata/Mir200/Map/`）

需要 `.map` 可行走栅格文件，同样可从热血传奇 1.80 客户端安装目录的 `Map` 目录获得：

```bash
ln -s "/你的热血传奇客户端安装目录/Map" gamedata/Mir200/Map
```

### 已随仓库分发（来源于网络流传的传奇服务端，非原创素材）

- `gamedata/mud2/DB/*.csv`：物品 / 怪物 / 技能模板数据（UTF-8，可直接编辑）
- `gamedata/Mir200/Envir/`：NPC 脚本 / 商店 / 爆率 / 任务 / 地图信息等配置

---

## 游戏数据（CSV）

`gamedata/mud2/DB/` 下是游戏模板数据，已从 Delphi Paradox `.DB` 二进制转为 **UTF-8 CSV**，可直接用 Excel / 文本编辑器修改：

| 文件 | 内容 |
|------|------|
| StdItems.csv | 物品模板（24 列：Idx, Name, StdMode, Shape, Weight, AniCount, …） |
| Monster.csv | 怪物模板（22 列：Name, Race, RaceImg, Appr, Level, …） |
| Magic.csv | 技能模板（19 列：MagId, MagName, EffectType, Effect, …） |

- 模板只在**首次启动**时导入 SQLite；修改 CSV 后需删除 `data/jootm2.db` 重启才会重新导入。

## Docker 运行

```bash
# 1. 准备好 ./resources 与 ./data 目录
docker compose up --build
```

`resources/` 和 `data/`（SQLite）以卷挂载，不打进镜像。

## 配置（config/server.properties）

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| server.port | 8080 | 监听端口 |
| server.ioThreads | 2 | Netty worker 线程数 |
| server.backlog | 256 | accept 队列 |
| db.file | data/jootm2.db | SQLite 文件 |
| game.tickMs | 100 | 游戏 tick（毫秒） |
| game.savePeriodSec | 30 | 玩家落盘周期（秒） |
| web.root | frontend | 前端静态目录 |
| resources.root | resources | 传奇资源目录 |
| resources.prefix | /resources | 资源 URL 前缀 |
| gamedata.root | gamedata | 游戏数据根目录 |

## 协议

客户端与服务端通过 WebSocket 发送 JSON 文本帧，完整协议清单见 [`HANDOFF.md` §7](HANDOFF.md)。

## 后续计划

- 底部快捷栏（数字键 1-6 快捷使用消耗品）
- NPC 出售数量选择
- 音效系统
- 更多优化项见 [`HANDOFF.md` §14](HANDOFF.md)

## 免责声明

本项目仅供学习、研究与个人怀旧体验，**不用于任何商业用途**。项目不提供、不分发任何受版权保护的游戏资源（图片库 / 地图 / 音效等）。使用本项目时，请自行准备合法的游戏资源，并遵守相关法律法规与游戏资源的授权条款。因使用本项目产生的任何问题，与作者无关。

## 许可证

代码采用 [MIT License](LICENSE) —— 自由使用 / 修改 / 分发（含商用），仅需保留版权与免责声明。资源文件不受本项目许可证约束。
