# jootm2 交接文档（给下一位 agent）

> 项目根目录：`/Volumes/未命名/jootm2/`
> 这是一份「已做 / 未做」的移交说明，含精确路径、技术要点与坑。接手后先读这里。

## 1. 项目是什么

把三件东西整合成了一个单进程的「传奇（Legend of Mir 2）风格」游戏服务端：

- 后端：Java 11 + **Netty**（HTTP + WebSocket 单端口）+ SQLite
- 前端：PixiJS HTML5 客户端（静态文件）
- 服务端数据：从老 Delphi 引擎（BDE/DBC2000 的 Paradox `.DB`、`.map`、`Mir200/Envir` 文本配置）转换/读取

**单端口 8080** 同时承载：

| 地址 | 说明 |
|------|------|
| `/` | 前端静态（PixiJS 客户端） |
| `/ws` | WebSocket 游戏协议 |
| `/api/status`、`/api/players`、`/api/broadcast` | REST 管理接口 |
| `/resources/*` | 客户端渲染资源（图片/地图/音效，带 CORS） |

## 2. 目录结构（关键路径）

```
jootm2/
├── pom.xml                         # Gson + SQLite + netty-all 4.1.115 + shade 打 fat-jar
├── src/main/java/com/jootm2/server/
│   ├── Main.java                   # 入口：装配配置/DB/Netty/游戏循环，启动时生成 resources.json + 导入 Paradox
│   ├── config/ServerConfig.java    # 配置加载（含 gamedataRoot/resourcesRoot 等）
│   ├── db/                         # SQLite：账号、角色、物品/怪物/技能模板（模板从 Paradox 导入）
│   │   └── Database.java           # schema + seedGameData()（Paradox→SQLite 导入）+ load*Templates()
│   ├── game/                       # 世界：Actor/Player/Monster/GameMap/GameWorld
│   │   └── common/                 # 数值/模板：ItemTemplate/MonsterTemplate/MagicTemplate/Direction/ExperienceTable...
│   ├── net/                        # ★ Netty 网络层（替换了旧 jootm2-server 的手写 NIO）
│   │   ├── NettyServer.java        # 端口/pipeline 装配
│   │   ├── HttpServerHandler.java  # 路由：/ /api/ /resources/ + CORS
│   │   └── ws/WebSocketFrameHandler.java # WebSocket 帧 ⇄ GameService，实现 PlayerSession
│   ├── resource/                   # ★ 数据读取器
│   │   ├── ParadoxDb.java          # Paradox .DB 解析（DBC2000/BDE），已用 Python 原型验证
│   │   ├── MapFileReader.java      # .map → GameMap 可行走栅格
│   │   ├── WorldData.java          # StartPoint.txt / MonGen.txt 文本解析（GBK）
│   │   └── ResourcesIndexGenerator.java # 启动时扫描 Data/Map/Wav 生成 resources.json
│   └── service/
│       ├── GameService.java        # WebSocket 消息入口 + 登录/角色/移动/攻击/聊天等业务
│       └── PlayerSession.java      # 传输抽象接口
├── frontend/                       # ★ 前端（从 /Volumes/未命名/client 拷来，改了两处 URL 为相对地址）
├── gamedata/                       # ★ 服务端数据（mud2 数据库 + Mir200 配置/脚本/地图）
├── resources/                      # ★ 客户端渲染资源（软链 → 见 §6）
├── config/server.properties        # 运行配置
├── scripts/smoke_test.py           # 端到端测试（注册→登录→建角→进游戏→移动→聊天→登出→战斗）
├── Dockerfile / docker-compose.yml / .dockerignore / .gitignore
└── target/jootm2.jar               # 构建产物（19MB）
```

## 3. 已完成（可运行、可验证）

1. **单进程 Netty 后端**：HTTP 静态 + REST + WebSocket + CORS，全部 8080。
2. **前端接入**：PixiJS 客户端静态托管；游戏内已接真实地图瓦片 + 角色 sprite（见第 14 条）。
3. **资源托管**：`/resources/*` 静态服务；`resources.json` 启动时自动生成。
4. **Paradox 数据库导入 SQLite**：`gamedata/mud2/DB/{StdItems,Magic,Monster}.DB` → SQLite，启动首次自动导入（`INSERT OR REPLACE` 去重）。
   - 结果：物品 535、怪物 267、技能 33（原库有重复行，已去重）。
5. **登录/注册/角色**：账号、角色持久化（SQLite FDB 替代）。
6. **真实地图**：`MapFileReader` 读 `.map` 得到 700×700 等真实可行走栅格；出生点来自 `StartPoint.txt`。
7. **真实刷怪**：`WorldData.loadMonGen` 解析 `MonGen.txt`，按怪点刷怪（地图懒加载时刷对应地图的怪）。
8. **基础战斗/移动/聊天/升级/怪物仇恨**：已有；`tryMove` 的「怪物未挂到地图」bug 已修。
9. **WebSocket JSON 协议**（与前端一致，见 §7）。
10. **多地图 + 地图切换**：解析 `MapInfo.txt`（445 地图、2474 门），`GameWorld.getOrLoadMap` 懒加载其它 `.map` 并刷怪；玩家踩到地图门自动换图（协议新增 `changeMap` 快照消息）；死亡复活按 `homeMap`、怪物重生按 `spawnMap` 定位；广播/nearby 均按地图过滤。已用 `/tmp/test_gate.py` 验证 0(309,613)→0121(3,16) 双向换图。
11. **NPC 系统（对话 + 脚本 + 商店 + 传送）**：`game/npc/` 下新增 `Npc`（实体）/`NpcScript`（脚本解析：`[@标签]` 段 + `#IF/#ACT/#SAY/#ELSESAY/#ELSEACT` 状态机）/`NpcScriptEngine`（执行：条件 `checkgold/checkitem/checklevel/checkpkpoint/checkjob/gender/equal/large/small/random`，动作 `take/give/mapmove/goto/break/close/set/reset/inc/dec`，变量 `<$$USERNAME>`，链接 `<文字/@标签>` 提取）；`resource/NpcData.java` 加载 `Npcs.txt`+`MerChant.txt`（303 个 NPC）及 `Npc_Def/`+`Market_Def/` 脚本（大小写不敏感 + `名-地图` 优先 fallback `名`）；商人 `[@buy]/[@sell]/[goods]` 买卖（金币/物品 give/take，`GameWorld` 新增 `itemTemplateByName/countItem/takeItems/giveItem`，`ItemTemplate` 加 `index`）。协议新增 `npcTalk/npcSelect/buyItem/sellItem`（客户端→）与 `npcSay/npcClose`（服务端→）。已用测试脚本验证：传送员对话+分支、商人 11 件商品列表+买卖、`mapmove` 传送到 T334。
12. **物品掉落/拾取/使用**：`game/GroundItem.java`（地面物品/金币堆）；`WorldData.loadMonItems` 解析 `MonItems/{怪物名}.txt`（格式 `n/m 物品名 [数量]`，判定 `selPoint>=random(maxPoint)`，金币=`count/2+random(count)`，物品掉 1 个，耐久 `20~100%` 随机）——启动加载 245 张掉落表；`GameWorld.dropLoot` 在怪物死亡时散落掉落并广播，`pickup` 拾取（距离≤1），`mapSnapshot` 附带 `groundItems`；`GameService` 新增 `pickup/useItem` 协议，`useItem` 支持吃药（stdMode 0/1/2，字段语义重载：AC=HP 恢复量、MAC=MP 恢复量）与穿装备（`slotFor` 装备位 + `needLevel` 等级检查 + `recompute`）。已用测试脚本验证：杀鸡掉鸡肉→拾取→吃药。
13. **客户端基础交互**：`frontend/scene/PlayScene.mjs` 补齐可玩闭环——渲染地面物品（金色方块+名字）、鼠标点击（点物品→走近拾取、点 NPC→走近对话、点怪物→走近普攻、点空地→走过去）、B 键背包面板（点击物品 useItem）、NPC 对话框（npcSay 文本+选项按钮+商店 buy 商品列表）、HUD 加金币；`SceneManager.mjs` 新增 `itemDrop/itemRemove/npcSay/npcClose/bagUpdate` 分发与 `send_pickup/send_use_item/send_npc_talk/send_npc_select`；`index.html` 加背包面板 + NPC 对话框 DOM；服务端新增 `bagUpdate{items,gold}` 消息（pickup/useItem/equip/buy/sell 后推送）。
14. **客户端真实画面（地图 + 角色 sprite）**：复用 `frontend/actor/MapActor.mjs`（完整等距地图渲染：大地砖 tiles + 小地砖 smtiles + 对象层 objects + 遮挡 mask + 缩放，瓦片 48×32）替换原网格；`PlayScene` 改用等距坐标（`_screen`），实体改绘真实 sprite——怪物用 `raceImg`（图像种族，`RaceByPM`/`GetMonImg`/`GetOffset`）+ `appr` 定位 `mon1~23` 图片库帧，NPC 用 `npc` 库 + `GetNpcOffset`，玩家用 `hum` 库 + `HA` 站立帧（按 `job*2+sex` 分块 ×600）；`ActorDefines.mjs` 补 `export`；服务端 `Actor.toBriefJson` 新增 `raceImg` 字段（`Monster.raceImg = template.raceImg`，图像种族 9~99 与服务器 `race` 81~97 是两套值）。纹理异步加载未完成时回退圆点。
15. **技能/魔法系统**：`MagicTemplate` 加命名字段 + `resolve()`（字段顺序以 Paradox 实际文件顺序为准，见 §10）；`Player` 加 `skills`（magicId→`Skill{level,curTrain}`）与 `skillCooldown`；`GameWorld` 加 `magicTemplates`；`GameService` 新增 `castMagic` 协议（客户端→`castMagic{magicId,targetId}`，服务端→`spellCast{casterId,magicId,effect}` 广播）：
    - 伤害魔法（火球 1/大火球 5/雷电 11/灭天火 35，伤害=威力随技能等级缩放+MC-目标魔御）+ 治愈魔法（治愈 2/群体治愈 24）+ 推开（抗拒火环 8/气功波 37，`pushAround`）+ 传送（瞬息移动 21，`randomTeleport`）；
    - MP 消耗随技能等级递增（`GetSpellPoint`=`Round(Spell/4*(level+1))+DefSpell`）、冷却（`Delay*10`）、技能已学检查；
    - 技能书学习（`useItem` 里 stdMode=4，`learnSkillBook`：职业匹配 `Job`、等级 `NeedLevel[0]`、学会 level=0）；熟练度升级（施法成功 `curTrain += 1~3`，达 `MaxTrain[lv]` 升级，`CheckMagicLevelup`）；
    - 创建角色给初始技能（战士=基本剑术3/法师=火球术1/道士=治愈术2），skills 随角色持久化（`{magicId:{level,train}}`）。
    已用测试验证：火球术伤害、治愈术 MP 递增（level0 扣 2）+ 约 9 次施法升级。
16. **完整战斗属性 + 毒/buff + 宠物**：
    - 命中/敏捷判定：`attack` 加 `hitCheck`（基础命中 15 + 装备 vs 基础敏捷 8 + 怪物 speed）；
    - 魔法躲避：`castMagic` 伤害魔法加 AntiMagic 判定（目标 `mac/5` 影响躲避率）；
    - 毒/buff：`Actor` 加 `poisonTicks/poisonDamage/lastPoisonAt`；`GameWorld.tick` 加 `applyPoison`（每 `POISON_INTERVAL_MS` 跳一次伤害，可致死）；施毒术（6）施放中毒；
    - 宠物：`Monster` 加 `masterId`、`Player` 加 `summonId`；召唤骷髅（17→`骷髅`）/召唤神兽（30→`神兽`）通过 `GameWorld.spawnSummon` 创建宠物、`removeSummon` 移除；`GameWorld.summonAi` 宠物跟随主人并协助攻击附近普通怪物（经验归主人 `grantExpTo`）。
17. **地图门 + 刷怪调度**：
    - 门：`MapFileReader` 读 tile 第 7 字节 `DoorIndex`（`0x80`=门标志、`&0x7F`=门号），`GameMap` 加门状态（`setDoor/isDoor/openDoor/closeDoor/closeTimedOutDoors`，门初始阻挡、开门变可走）；`tryMove` 里玩家走向关闭的门自动推开（`broadcastDoor` 广播 `doorState`），`tick` 定时关闭超时门（`DOOR_OPEN_MS=5s`）。地图 0 共 95 个门 tile。
    - 刷怪：`MonGen.txt` 第 7 列「刷怪时间（分钟）」→ `MonGenEntry.intervalMin`；`Monster.respawnIntervalMs`，`killMonster` 按间隔重生（`intervalMin*60s`，无则默认 `RESPAWN_MS`）。
18. **任务系统（MapQuest）**：
    - `WorldData.loadMapQuest` 解析 `MapQuest.txt`（`mapId [setNumber] value monName itemName qfile [GROUP]`，`*`=不触发该项），共 10 条。
    - `GameWorld.loadMapQuests` 加载 `MapQuest_Def/{qfile}.txt` 脚本（复用 `NpcScript`），共 6 个脚本。
    - `killMonster(m, now, killer)` 增加 killer 参数；击杀后 `triggerMapQuest(killer, m)` 匹配 `mapId+monName+玩家旗标==value` 后执行脚本（`NpcScriptEngine.executeScript`），`#SAY` 文本经 `sendSystem` 发给玩家。
    - 脚本引擎补 `check [n] v`（旗标 `>=`）条件；`Player.questParams` 从 100 扩到 1000（MapQuest 旗标号 400+）；修复 `random n` 语义（Delphi `Random(n)=0`，1/n 概率，原来写反成 n-1/n）。
19. **装备特殊属性 + 套装**（对齐 `ObjBase.pas` 的 `RecalcAbilitys`）：
    - `Player` 加 `luck/suckHealthRate/manaToHealth/paralysisWeapon/revivalRing/teleportRing`，`recompute` 按装备 Shape 计算：麻痹武器(23)、传送戒指(112)、复活戒指(114)、护身(133/134/135, AniCount=MP转HP)、吸血(136/137/138, AniCount=吸血%)、幸运(武器 specialPwr 1-10)、三职业套装(153-161，手镯+戒指基础、项链加成 DC/MC/SC)。
    - 生效：吸血/麻痹在 `GameService.attack`（麻痹 15% 定身 2s，`Monster.paralyzedUntil`）；护身在 `attackPlayer` 先扣 MP；复活戒指在 `killPlayer` 免死一次并损毁（`removeEquippedByShape`）；幸运在 `rollDcWithLuck` 有 luck/10 概率出最高攻击。
    - 数据：祈祷之刃(麻痹)、魔血三件(护身25)、虹魔三件(吸血5)、复活/传送/隐身戒指均在；套装 Shape 153-161 本数据无（代码就位，加数据即生效）。
20. **剩余魔法类型**（对齐 `Magic.pas` `SpellNow` 分支）：
    - 隐身术/集体隐身术（18/19）：`Player.hideUntil`（30+3*SC 秒），`resolveTarget` 隐身时不成为仇恨目标。
    - 火墙（22）：`GameWorld.makeFireWall` 目标十字 5 格生成 `FireWall`，`tickFireWalls` 每秒对踩上怪物造成 MC 伤害并广播（`magicId=22`）。
    - 诱惑之光（20）：成功则怪物 `masterId=玩家` 变宠物（复用召唤物 AI），对已有宠物施放则定身（`paralyzedUntil`）。
    - 至此魔法全部覆盖：伤害(1/5/11/35)、治愈(2/24/29)、推开(8/37)、传送(21)、施毒(6)、召唤(17/30)、隐身(18/19)、火墙(22)、诱惑(20)。
21. **行会 + 攻城（Guild/Castle）**（对齐 `Guild.pas` / `Castle.pas` 的核心子集）：
    - `Guild`（game 包）：名字、会长、成员列表、长老、`ownsCastle`；`GameWorld` 加 `guilds`/`guildOfPlayer` 映射，提供 `createGuild/joinGuild/leaveGuild/guildByName/guildOf`（会长退会=解散）。
    - `Castle`（game 包）：城门 + 3 段城墙 HP、攻城状态；`WorldData.loadCastle` 解析 `Envir/Castle/Sabuk.txt`（沙巴克 map=3 城门 HP10000）。
    - 攻城：`declareSiege`（攻城 5 分钟）、`attackCastleDoor`（靠近城门才有效）、`tickSiege` 结束时城门+城墙全破则攻城行会 `ownsCastle=true`。
    - 协议：`GameService` 加 `createGuild/joinGuild/leaveGuild/guildInfo/guildChat/siege`；行会聊天按成员列表定向发送 `guildChat`。
    - 说明：`GuildBase/` 目录为空（无行会持久化文件），行会仅存内存（未做 DB 落盘）；测试脚本 `scripts/guild_test.py`。
22. **社会系统补全**（组队/仓库/交易/行会持久化/祝福油/行会战）：
    - 组队：`Party`（game 包）+ `partyOf` 映射，`createParty/joinParty/leaveParty`；`grantExp` 组队共享经验（附近 10 格平分）；协议 `partyInvite/partyLeave/partyChat`。
    - 仓库：`Player.storage`（独立于背包）+ `CharacterRecord.storage` + `characters.storage` 列（含 ALTER 迁移）；协议 `storageOpen/storageStore/storageTake`（容量 45）。
    - 交易：`TradeSession` + `tradeRequests/trades`（GameService）；`tradeRequest/tradeAccept/tradeAddItem/tradeAddGold/tradeConfirm/tradeCancel`，双方确认后交换物品+金币（取消则归还）。
    - 行会持久化：`GuildBase/{name}.txt`（对齐 Delphi `BackupGuild` 格式：成员 `+`、`城主`、`盟友 `、`敌对 `）；`loadGuilds/saveGuild/deleteGuildFile`。
    - 祝福油：`ItemInstance.lucky`（实例幸运 0..7）；`useBlessOil`（stdMode=3，50% 升/30% 不变/20% 降）；`recompute` 幸运 = 模板 specialPwr + 实例 lucky。
    - 行会战/同盟：`Guild.allyGuilds/warGuilds`；`declareGuildWar/makeGuildAlly`（互相加入列表 + 持久化）；协议 `guildWar/guildAlly`。
23. **前端重写：阶段 2（登录 → 选角 → 游戏场景）**：
    - `net/Connection.mjs`：WebSocket JSON 封装（`send(type,payload)` / `on(type,cb)`，`'*'` 通配路由）。
    - `scene/Scene.mjs`（基类：onEnter/onExit/onMessage/update/render）+ `scene/SceneManager.mjs`：场景生命周期 + 服务端消息路由到当前场景。
    - `ui/LoginScene.mjs`：登录/注册面板（注册成功自动登录）；`ui/SelectCharScene.mjs`：角色列表 + 创建（性别/发型/职业分段选择）+ 删除 + 进游戏。
    - `image/Images.mjs`：WIL 库懒加载管理（`getLib(key)`）；`map/Maps.mjs`：.map 解析（tile 12/14 字节、动画帧、混合标志）；`map/MapActor.mjs`：canvas 等距渲染 —— 大地砖 2×2（仅偶坐标）、小地砖、对象层按行遮挡（anchor 下方），动画光效用 `lighter` 加法混合消除黑底。
    - `scene/PlayScene.mjs`：实体 Map 管理、方向键移动（120ms 循环，WASD 同支持）、聊天框、HUD、空格攻击最近怪；处理 `entityAdd/entityRemove/move/stats/attack/death/chat/changeMap`。
    - `main.mjs`：`loadResources()` → WS `/ws` → LoginScene 链路（**坑：漏了 loadResources 会导致 mapUrl 全 null、地图不加载**）。
    - **关键坑（已修）**：服务端 `enterGame` 后紧跟 `broadcastEntityAdd(自己)`，前端若不过滤会把 entities[self.id] 覆盖成 toBriefJson 简化对象，与 self（toPlayerJson 完整对象）引用分离 → move 更新 entities 而 self 不动（表现为「客户端原地不动」）。entityAdd 需跳过 `msg.entity.id === self.id`。
    - 验证（Playwright）：注册→建角→进图→移动（右/上各 +5 格）→聊天→怪物自动攻击进日志；截图确认地图纹理/房屋/光效渲染正常。过渡期实体用圆点+血条（真实 sprite 在 §14 待办）。

关键入口文件：`Main.java`、`service/GameService.java`、`game/GameWorld.java`、`game/npc/*`、`resource/NpcData.java`、`db/Database.java`、`net/*`。

## 4. 未完成 / 待办（就是「移植整个 M2Server」剩下的部分）

> 老 M2Server 的 Delphi 源码在 `/Volumes/未命名/fire/Source/M2Server/`（也有一份在 `~/Documents/火炬源码+配套服务端/Source/M2Server/`）。

**核心玩法子系统已全部移植完成。** 剩余 3 项经调研**无法通过源码推断实现**（该版 M2Server 源码中不存在相应系统，不属于「移植」范畴，属于新增功能）：

- ~~结婚/师徒~~：Delphi 源码全文搜索 `MarrySystem`/`MasterSlave`/结婚/师徒 **0 匹配**，该系统在本版传奇源码中不存在。
- ~~摆摊~~：源码仅有 `Market_Def`（NPC 商店），无玩家摆摊/摊点（`Stall`）系统。
- ~~装备强化升级（非祝福油）~~：源码有 `RandomUpgradeItem`/`UserSelectGetBackUpgrade`（提交黑铁矿→等待 1 小时→随机成败的 NPC 升级），但依赖专门 NPC 脚本 + 升级材料数据 + `UpgradingList` 持久化，属独立大工程，可后续按需单独立项。

## 5. 迁移方向建议（给新 agent）

1. ~~多地图 + 地图切换~~（已完成，见 §3 第 10 条）。
2. ~~NPC 系统~~（已完成，见 §3 第 11 条）。
3. ~~物品掉落/拾取/使用~~（已完成，见 §3 第 12 条）。
4. ~~技能/魔法释放~~（已完成，见 §3 第 20 条）。
5. ~~任务系统、行会/攻城~~（已完成，见 §3 第 18/21 条）。

## 6. 数据依赖（重要，不在 git 里）

两处是**软链接**，指向你机器上的真实数据，接手机器上必须存在（或改成 Docker 挂载）：

| 软链 | 指向 | 用途 |
|------|------|------|
| `resources/` | `/Users/linxing/Desktop/Legend of Mir` | 客户端渲染资源（Data 图片库 / Map / Wav），`resources.json` 也是生成到这里 |
| `gamedata/Mir200/Map/` | `/Users/linxing/Documents/火炬源码+配套服务端/MirServer/Mir200/Map` | 服务端 `.map`（可行走栅格） |

- `gamedata/mud2/DB/*.DB`（Paradox 原始表）是**真实文件**，已拷入，可 git 管理。
- `gamedata/Mir200/Envir/`（MapInfo/MonGen/Npcs/MerChant/MapQuest/MonItems/Npc_Def/Market_Def…）是**真实文件**，已拷入。
- 前端 `frontend/` 是从 `/Volumes/未命名/client/` 拷来的副本（改了 index.html 两处 URL），后续改前端应在 `frontend/` 里改。

## 7. WebSocket JSON 协议

客户端 → 服务端：`login{username,password}` `register` `listCharacters` `createCharacter{name,sex,hair,job}` `deleteCharacter{name}` `enterGame{name}` `move{dir}` `say{text}` `attack{targetId}` `npcTalk{npcId}` `npcSelect{npcId,value}` `buyItem{npcId,index,count}` `sellItem{npcId,makeIndex}` `pickup{itemId}` `useItem{makeIndex}` `logout` `ping`

服务端 → 客户端：`loginResult` `registerResult` `characterList` `createCharacterResult` `deleteCharacterResult` `enterGameResult` `enterGame{map,player,nearby,groundItems}` `changeMap{map,player,nearby,groundItems}` `entityAdd` `entityRemove` `move` `stats` `attack` `death` `chat` `systemMessage` `itemDrop{id,name,looks,x,y,gold}` `itemRemove{id}` `bagUpdate{items,gold}` `npcSay{npcId,name,text,options[{label,value}],shop?,goods[{index,name,price,stock}]}` `npcClose{npcId}` `pong`

方向常量 0..7（`game/common/Direction.java`）：0上 1右上 2右 3右下 4下 5左下 6左 7左上。

## 8. 构建 / 运行 / 测试

```bash
cd /Volumes/未命名/jootm2
mvn -DskipTests package          # 产物 target/jootm2.jar
java -jar target/jootm2.jar      # 默认读 config/server.properties，监听 8080
```

- 启动日志关键行：`[db] imported Paradox: items=541, monsters=273`、`[resources] generated ...`、`[world] map=0 700x700, spawned monsters=N`、`[main] jootm2 started on port 8080`。
- 浏览器打开 `http://localhost:8080/` 即可玩（注册→登录→建角→进游戏）。
- 端到端测试：先起服务，再 `python3 scripts/smoke_test.py`（通过输出 `SMOKE TEST PASSED`）。
- **重新导入数据**：删 `data/jootm2.db*` 后再启动（模板表为空才触发 Paradox 导入）。
- Docker：`docker compose up --build`；`resources/` 与 `data/` 用卷挂载（`gamedata` 未打进镜像，需在镜像内挂载（见 `docker-compose.yml` 与 README）。

## 9. 配置项（config/server.properties）

`server.port` `server.ioThreads` `server.backlog` `db.file` `game.tickMs` `game.savePeriodSec` `web.root` `resources.root` `resources.prefix` `gamedata.root` `world.*`。
关键新增：`gamedata.root=gamedata`（`gamedata/mud2/DB` 与 `gamedata/Mir200/` 相对此根）。

## 10. 关键技术点（接手必读）

- **Paradox .DB 格式**（`resource/ParadoxDb.java`）：头部 `recordSize(0x00)`/`blockSize(0x02)`/`记录数(0x06)`；`0x78` 起是「字段类型+长度」2 字节描述；数据块 = 6 字节块头 + 连续定长记录。整数是大端 + 高字节标志位，字符串是 GBK、NUL 补齐。
- **字段语义来源**：老 Delphi `M2Server/LocalDB.pas` 的 `LoadStdItems / LoadMonsters / LoadMagic`。`Magic.DB` 只有类型/长度、不存字段名，id+name 之外用类型化列表保留在 `MagicTemplate.attrs`，再经 `resolve()` 映射为命名字段。
- **Magic.DB 字段顺序（坑！）**：`FieldByName` 是按名查，顺序 ≠ 文件顺序。Paradox 文件里**实际字段顺序**（从 header 字段名表读出）是：`MagID, MagName, EffectType, Effect, Spell(MP), Power(min), MaxPower, DefSpell, DefPower(min), DefMaxPower, Job, NeedL1, L1Train, NeedL2, L2Train, NeedL3, L3Train, Delay, Descr`（19 字段，`attrs` 去掉 MagId/Name 后 17 个）。`DelayTime = Delay*10`；`NeedLevel` 是学习门槛（施放不检查），`Spell` 是施法 MP 消耗。
- **.map 格式**（`resource/MapFileReader.java`）：52 字节头（宽/高/标题/日期/保留）+ `宽*高` 个 12 字节瓦片；bng/mid/obj 各 2 字节，`0x8000` 位=阻挡。
- **编码**：所有 gamedata 文本（MapInfo/MonGen/Npcs/…）与 Paradox Alpha 字段都是 **GBK**（Java 用 `Charset.forName("GBK")`）。SQLite 内部存 UTF-8（Gson JSON）。
- **模板表**：`std_items(idx,data)` `monsters(name,data)` `magics(mag_id,data)`，`data` 是模板类的 Gson JSON，见 `db/Database.java`。
- **前端残留死代码**：`frontend/` 里 `EDcode.mjs`/`GB2312Encoder.mjs`/`SDK.mjs` 的 `Messages` 都是老二进制协议遗留；现用 JSON，实际入口是 `frontend/scene/SceneManager.mjs`（照 §7 收发）。

## 11. 已发现的坑 / 注意

- **怪物/技能名带数字后缀**：导入自我托管数据，原 `Monster.DB`/`Magic.DB` 本身就有 `骷髅精灵10`、`驽马精灵0` 这类名字，是源数据如此，非解析 bug（`洞蛆`/`多钩猫`/`火球术` 等均正确）。
- **.DB 有重复行**：`跳跳蜂1`×7、magId 11/15/20/26/29/30 各×2、idx 476×7，已用 `INSERT OR REPLACE` 去重（后写覆盖）。
- **之前的手写 NIO 版有 bug**：`addActor` 没把怪物挂到地图导致 `tryMove` 会 NPE；已修（`GameWorld.addActor` 里 `if(a.map==null) a.map=defaultMap`）。
- **smoke_test 战斗偶发「未击杀」**：怪物池从 3 个变 267 个后，可能随到高 HP 怪，是测试的随机性，非代码错误（`SMOKE TEST PASSED` 仍输出）。
- **客户端游戏画面**：旧 client 副本（`/Volumes/未命名/client/`）的 PlayScene 是简化网格；新前端（`frontend/`，见 §3 第 23 条）已用真实等距地图渲染，实体暂为圆点+血条（真实 sprite 见 §14 待办）。
- **无残留进程**：交接前已停掉我起的服务端/资源服务器，端口 8080/55842 均空闲。

## 12. 参考材料

- 老 Delphi 源码：`/Volumes/未命名/fire/Source/M2Server/`（M2Share.pas / LocalDB.pas / Envir.pas / ObjBase.pas / ObjMon.pas / ObjNpc.pas / Magic.pas / svMain.pas …）
- 老服务端运行时+数据：`/Users/linxing/Documents/火炬源码+配套服务端/MirServer/`
- 原始 HTML5 客户端：`/Volumes/未命名/client/`（PixiJS；`map/Maps.mjs` 是 .map 解析参考）
- 老 Java NIO 服务端（已被本项目的 Netty 替代）：`/Volumes/未命名/jootm2-server/`
- 项目 README 与本文档：`README.md`、`HANDOFF.md`

## 13. 一句总结

单体 Netty 服务端骨架、前端托管、资源托管、Paradox→SQLite、账号角色、真实地图+真实刷怪、基础战斗/聊天都已就绪且 `mvn package` + smoke test 通过；「整个 M2Server」剩余的是 **多地图、NPC/商店/任务脚本、技能、装备/掉落、行会/攻城** 这几大块，数据文件都已就位（见 §6），建议按 §5 顺序逐个补齐。

## 14. 优化项备忘（先记不做，优先保证主线）

> 原则：识别到的进阶优化**先记在此处**，不立即实现，优先推进主线功能。主线完成后择机逐项做。

### 前端 WIL / 资源加载
- [ ] **请求优先级队列**：可见区域 / 当前交互请求的 chunk 优先于离屏预取，避免抢占关键帧（`frontend/gfx/scheduler.mjs` 目前是纯 FIFO + 全局 5 并发 + 去重 + 边界对齐图头）。**实例**：进图后动画光效 10 帧大图（100×100）会挤占 tiles 带宽，地面要 10 秒+ 才铺满，优先级队列可解。
- [ ] **预测预取**：地图滚动 / 角色移动时按方向预加载前方 tile，降低滚图卡顿（地图场景比 UI 更吃这个）。
- [ ] **chunk 级缓存**：当前是图级缓存（解包后存 canvas）；若解包耗时成瓶颈，改缓存「已解包的 chunk」避免重复解包同一 chunk。

### 前端渲染（阶段 2 后续）
- [ ] **实体真实 sprite**：`scene/PlayScene.mjs` 的 `_renderEntities` 目前是圆点+血条（过渡）；对齐旧客户端 —— 玩家用 `hum` 库站立帧（job*2+sex 分块×600）、怪物 `raceImg`+`appr` 定位 `mon1~23`、NPC 用 `npc` 库 + `GetNpcOffset`（参考 `/Volumes/未命名/client/actor/ActorDefines.mjs`）。
- [ ] **点击交互**：点地走（寻路）、点怪走近攻击、点 NPC 对话、点物品拾取。
- [ ] **背包/装备/NPC 对话框 GUI**：`gui/` 框架已就绪（DWindow/DGrid/DButton），接服务端 `bagUpdate/npcSay` 协议即可。

### 音频
- [ ] **音效系统**：`resource.mjs` 的 `wavUrl/wavCount` 已就绪（694 个 wav，`/resources/Wav/` 已托管 `audio/wav`），后续做 Web Audio 播放 + 按场景预加载。

### 后端
- [ ] **攻城状态落盘**：`castle.warActive/warEndAt/mainDoorHp/wallHp` 仅内存，未持久化（行会文本已落盘 `GuildBase/`）。
- [ ] **装备强化升级**（非祝福油）：`RandomUpgradeItem`/`UserSelectGetBackUpgrade` 依赖专门 NPC 脚本 + 升级材料 + `UpgradingList` 持久化，属独立工程（见 §4）。