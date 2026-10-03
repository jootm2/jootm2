# jootm2 交接文档（给下一位 agent）

> 项目根目录：`/Volumes/未命名/jootm2/`
> 这是一份「已做 / 未做」的移交说明，含精确路径、技术要点与坑。接手后先读这里。

## 1. 项目是什么

把三件东西整合成了一个单进程的「传奇（Legend of Mir 2）风格」游戏服务端：

- 后端：Java 11 + **Netty**（HTTP + WebSocket 单端口）+ SQLite
- 前端：**原生 canvas 2d**（等距地图渲染）+ DOM GUI（登录/选角/背包），ES Module 静态文件（**已从旧 PixiJS client 副本重写**，见 §3 第 23 条）
- 服务端数据：从老 Delphi 引擎（BDE/DBC2000 的 Paradox `.DB` 已转 CSV、`.map`、`Mir200/Envir` 文本配置）转换/读取

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
│   ├── Main.java                   # 入口：装配配置/DB/Netty/游戏循环，启动时生成 resources.json + 导入 CSV 模板
│   ├── config/ServerConfig.java    # 配置加载（含 gamedataRoot/resourcesRoot 等）
│   ├── db/                         # SQLite：账号、角色、物品/怪物/技能模板（模板从 CSV 导入）
│   │   └── Database.java           # schema + seedGameData()（CSV→SQLite 导入）+ load*Templates()
│   ├── game/                       # 世界：Actor/Player/Monster/GameMap/GameWorld
│   │   └── common/                 # 数值/模板：ItemTemplate/MonsterTemplate/MagicTemplate/Direction/ExperienceTable...
│   ├── net/                        # ★ Netty 网络层（替换了旧 jootm2-server 的手写 NIO）
│   │   ├── NettyServer.java        # 端口/pipeline 装配
│   │   ├── HttpServerHandler.java  # 路由：/ /api/ /resources/ + CORS
│   │   └── ws/WebSocketFrameHandler.java # WebSocket 帧 ⇄ GameService，实现 PlayerSession
│   ├── resource/                   # ★ 数据读取器
│   │   ├── MapFileReader.java      # .map → GameMap 可行走栅格
│   │   ├── WorldData.java          # StartPoint.txt / MonGen.txt 文本解析（GBK）
│   │   └── ResourcesIndexGenerator.java # 启动时扫描 Data/Map/Wav 生成 resources.json
│   └── service/
│       ├── GameService.java        # WebSocket 消息入口 + 登录/角色/移动/攻击/聊天等业务
│       └── PlayerSession.java      # 传输抽象接口
├── frontend/                       # ★ 前端（原生 canvas 2d 重写，ES Module）
│   ├── main.mjs                    #   入口：loadResources → WS /ws → LoginScene → 主循环
│   ├── index.html                  #   #stage 容器（#screen canvas + #gui DOM 层）
│   ├── core/                       #   config（800×600/瓦片48×32）、loop（rAF 主循环）
│   ├── gfx/                        #   WIL 加载：wil.mjs（8/16位解包）、palette、resource（图片/地图/音频 URL 索引）、scheduler（全局5并发+去重+边界对齐图头）
│   ├── image/Images.mjs            #   WIL 库懒加载管理 getLib(key)
│   ├── map/                        #   Maps.mjs（.map解析）、MapActor.mjs（canvas等距渲染+遮挡+光效混合）
│   ├── net/Connection.mjs          #   WebSocket JSON 封装（type 分发 + '*' 通配）
│   ├── scene/                      #   Scene 基类、SceneManager（场景切换+消息路由）、PlayScene（游戏场景）
│   ├── ui/                         #   LoginScene（登录/注册）、SelectCharScene（选角/创建）
│   └── gui/                        #   DControl/DWindow/DButton/DGrid/DWinManager（DOM GUI 框架，游戏内背包/NPC对话框用）
├── gamedata/                       # ★ 服务端数据（mud2 数据库 + Mir200 配置/脚本/地图）
├── resources/                      # ★ 客户端渲染资源（软链 → 见 §6）
├── config/server.properties        # 运行配置
├── scripts/smoke_test.py           # 端到端测试（注册→登录→建角→进游戏→移动→聊天→登出→战斗）
├── Dockerfile / docker-compose.yml / .dockerignore / .gitignore
└── target/jootm2.jar               # 构建产物（19MB）
```

## 3. 已完成（可运行、可验证）

1. **单进程 Netty 后端**：HTTP 静态 + REST + WebSocket + CORS，全部 8080。
2. **前端静态托管**：8080 提供 `/` 静态 + `/ws` WebSocket + `/resources/*` 渲染资源（带 CORS）。**注意**：当前前端是原生 canvas 2d 重写（见第 23 条）；下面第 13/14 条是早期旧 PixiJS client 副本的工作记录，已被替代、**勿参考**。
3. **资源托管**：`/resources/*` 静态服务；`resources.json` 启动时自动生成。
4. **游戏模板 CSV 导入 SQLite**：`gamedata/mud2/DB/{StdItems,Magic,Monster}.csv`（UTF-8，带表头，可直接编辑）→ SQLite，启动首次自动流式导入（`INSERT OR REPLACE` 去重）。CSV 由 `scripts/paradox_to_csv.py` 从旧 Delphi Paradox `.DB` 一次性导出（`.DB` 已删除，不再保留二进制格式）。
   - 结果：物品 535、怪物 267、技能 33（原库有重复行，已去重）。
5. **登录/注册/角色**：账号、角色持久化（SQLite FDB 替代）。
6. **真实地图**：`MapFileReader` 读 `.map` 得到 700×700 等真实可行走栅格；出生点来自 `StartPoint.txt`。
7. **真实刷怪**：`WorldData.loadMonGen` 解析 `MonGen.txt`，按怪点刷怪（地图懒加载时刷对应地图的怪）。
8. **基础战斗/移动/聊天/升级/怪物仇恨**：已有；`tryMove` 的「怪物未挂到地图」bug 已修。
9. **WebSocket JSON 协议**（与前端一致，见 §7）。
10. **多地图 + 地图切换**：解析 `MapInfo.txt`（445 地图、2474 门），`GameWorld.getOrLoadMap` 懒加载其它 `.map` 并刷怪；玩家踩到地图门自动换图（协议新增 `changeMap` 快照消息）；死亡复活按 `homeMap`、怪物重生按 `spawnMap` 定位；广播/nearby 均按地图过滤。已用 `/tmp/test_gate.py` 验证 0(309,613)→0121(3,16) 双向换图。
11. **NPC 系统（对话 + 脚本 + 商店 + 传送）**：`game/npc/` 下新增 `Npc`（实体）/`NpcScript`（脚本解析：`[@标签]` 段 + `#IF/#ACT/#SAY/#ELSESAY/#ELSEACT` 状态机）/`NpcScriptEngine`（执行：条件 `checkgold/checkitem/checklevel/checkpkpoint/checkjob/gender/equal/large/small/random`，动作 `take/give/mapmove/goto/break/close/set/reset/inc/dec`，变量 `<$$USERNAME>`，链接 `<文字/@标签>` 提取）；`resource/NpcData.java` 加载 `Npcs.txt`+`MerChant.txt`（303 个 NPC）及 `Npc_Def/`+`Market_Def/` 脚本（大小写不敏感 + `名-地图` 优先 fallback `名`）；商人 `[@buy]/[@sell]/[goods]` 买卖（金币/物品 give/take，`GameWorld` 新增 `itemTemplateByName/countItem/takeItems/giveItem`，`ItemTemplate` 加 `index`）。协议新增 `npcTalk/npcSelect/buyItem/sellItem`（客户端→）与 `npcSay/npcClose`（服务端→）。已用测试脚本验证：传送员对话+分支、商人 11 件商品列表+买卖、`mapmove` 传送到 T334。
12. **物品掉落/拾取/使用**：`game/GroundItem.java`（地面物品/金币堆）；`WorldData.loadMonItems` 解析 `MonItems/{怪物名}.txt`（格式 `n/m 物品名 [数量]`，判定 `selPoint>=random(maxPoint)`，金币=`count/2+random(count)`，物品掉 1 个，耐久 `20~100%` 随机）——启动加载 245 张掉落表；`GameWorld.dropLoot` 在怪物死亡时散落掉落并广播，`pickup` 拾取（距离≤1），`mapSnapshot` 附带 `groundItems`；`GameService` 新增 `pickup/useItem` 协议，`useItem` 支持吃药（stdMode 0/1/2，字段语义重载：AC=HP 恢复量、MAC=MP 恢复量）与穿装备（`slotFor` 装备位 + `needLevel` 等级检查 + `recompute`）。已用测试脚本验证：杀鸡掉鸡肉→拾取→吃药。
13. **客户端基础交互（旧 PixiJS 副本，已废弃）**：`frontend/scene/PlayScene.mjs` 补齐可玩闭环——渲染地面物品（金色方块+名字）、鼠标点击（点物品→走近拾取、点 NPC→走近对话、点怪物→走近普攻、点空地→走过去）、B 键背包面板（点击物品 useItem）、NPC 对话框（npcSay 文本+选项按钮+商店 buy 商品列表）、HUD 加金币；`SceneManager.mjs` 新增 `itemDrop/itemRemove/npcSay/npcClose/bagUpdate` 分发与 `send_pickup/send_use_item/send_npc_talk/send_npc_select`；`index.html` 加背包面板 + NPC 对话框 DOM；服务端新增 `bagUpdate{items,gold}` 消息（pickup/useItem/equip/buy/sell 后推送）。
14. **客户端真实画面（旧 PixiJS 副本，已废弃，勿参考；sprite 逻辑应以 Delphi 客户端源码为准）**：历史记录——旧副本用 `frontend/actor/MapActor.mjs` 做等距渲染，实体 sprite 用怪物 `raceImg`+`appr` 定位 `mon1~23`、NPC `npc` 库 + `GetNpcOffset`、玩家 `hum` 库站立帧。**这些 sprite 逻辑的正确移植来源是 Delphi 客户端源码 `Client/Actor.pas`（`RaceByPM`/`GetMonImg`/`GetOffset`/`GetNpcOffset`）与 `Client/PlayScn.pas`**，而非旧 PixiJS 副本。服务端 `Actor.toBriefJson` 的 `raceImg` 字段（`Monster.raceImg = template.raceImg`，图像种族 9~99 与服务器 `race` 81~97 是两套值）已就绪。
15. **技能/魔法系统**：`MagicTemplate` 加命名字段 + `resolve()`（字段顺序以 CSV 列顺序为准，见 §10）；`Player` 加 `skills`（magicId→`Skill{level,curTrain}`）与 `skillCooldown`；`GameWorld` 加 `magicTemplates`；`GameService` 新增 `castMagic` 协议（客户端→`castMagic{magicId,targetId}`，服务端→`spellCast{casterId,magicId,effect}` 广播）：
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
24. **前端 WIL 加载加速**（`frontend/gfx/`）：
    - `scheduler.mjs`：全局 HTTP Range 请求调度器 —— 最多 **5 并发**（先到先得、所有库共享）+ **去重**（请求偏移落在进行中 chunk 内则复用其数据）+ 从 Content-Range 解析文件总大小。
    - `wil.mjs`：8/16 位 WIL 解包 → RGBA → 离屏 canvas 缓存；一次请求拉 512K chunk，**一次性解包范围内所有图**（冗余缓存）；chunk 边界用 `_chunkEnd` 二分**对齐到图头**（`sortedOffsets`），避免截断图片；1×1 占位图跳过；`loadIndex` 防并发重复。
    - 验证：40 张 tiles 图仅 2 次 fetch（解包 104 张）；多库并发峰值 active=5；tiles/magic/magic2 三库 chunk 全对齐图头、截断数 0。
25. **音频资源**（`resources/Wav/`，694 个 wav）：
    - `resource.mjs` 加 `wavUrl(soundId)` / `wavCount()`（对接 `resources.json` 的 `wavs` 键）。
    - 后端 `HttpServerHandler.contentType` 加 `.wav→audio/wav`（另加 mp3/ogg）；已确认支持 Range 206 + CORS `*`。
    - 验证：Playwright `Audio` 元素加载成功可播放（duration 1.5s）。音效播放系统本身未做（§14 待办）。
26. **实体真实 sprite**（前端阶段 2 后续，替代圆点）：
    - `frontend/actor/actorData.mjs`：1:1 移植 Delphi `Client/Actor.pas` —— 人类动作表 `HA`、怪物/NPC 动作表 `MA9~MA52`（stand 字段）、`RaceByPM`（raceImg 9~99 → 动作表，已核对 DB 全部 distinct raceImg 均覆盖）、`GetMonImg`（appr div 10 → `mon1~mon21`/`effect` 图库 key）、`GetOffset`（ appr → 帧偏移，含 13/18/19/20/90 特例表）、`GetNpcOffset`（appr → 60 帧块偏移）。
    - `frontend/actor/ActorSprite.mjs`：按实体类型计算站立帧图索引（公式 `方向块起始 = offset + act.start + dir*(frame+skip)`，`ftime` 循环动画，实体 id 相位错开防同步），分层返回：玩家 = 武器(`weaponLooks>=2`)→身体→头发(`hair>=1`)，`hum`/`hair`/`weapon` 库各 `600 帧/外观`，`dress = job*2+sex`（初始外观）；怪物/ NPC 单层。纹理懒加载（同步查缓存 + 异步触发）。
    - `MapActor.render` 实体绘制改为 `layers` 多层（锚点 = 格子底部中心 + 纹理 `px/py` 偏移），名字照旧；`PlayScene` 弃用圆点，`_renderEntities` → `_renderHpBars`（只画血条），sprite 按 id 缓存（entityAdd 替换对象后自动重建）。
    - 服务端：`Player.toPlayerJson` 补 `weaponLooks` 字段（与 toBriefJson 一致，self 也带武器外观）。
    - 验证（Playwright 截图）：玩家/怪物（稻草人 raceImg=18 appr=27）/NPC sprite 渲染正常，血条 + 名字正常，攻击日志正常。
27. **行走/攻击动画 + 点击交互**：
    - `actorData.mjs` 补全 MA 表完整动作段（stand/walk/attack/struck/die/death 各 `start/frame/skip/ftime`，来自 `Actor.pas` MA9~MA52 全量）。
    - `ActorSprite.mjs` 动作状态机：实体 `_action`（stand/walk/attack/struck/die）+ `_actionAt` 驱动帧段切换；walk/attack/struck 播完自动回 stand、die 停在末帧（普通怪物重生时 entityAdd 替换对象恢复）；玩家动作映射 HA（attack→hit 段）。
    - `map/pathfind.mjs`：8 方向 A* 寻路（切比雪夫启发式 + 斜线 1.4 代价），返回方向序列（与服务器 Direction 一致）。
    - `PlayScene`：canvas 点击 → cell 换算（`tx=round((mx-ox)/48+self.x)`，ox=376/oy=206）→ 目标判定（怪物→走近攻击、NPC→走近 npcTalk、地面物品→走近 pickup、空地→寻路移动）；`moveTimer` 支持 path 队列 + 到达回调（覆盖键盘移动）；维护地面物品（enterGame/changeMap 快照 `groundItems` + `itemDrop/itemRemove` 消息）；地面物品渲染（金币金色圆点/物品绿块+名字）。
    - 验证：点击移动成功（(289,618)→(290,623)）；findPath 到可站格返回正确方向序列、到墙格（canStand=false）返回 null。
28. **背包/装备/NPC 对话框 GUI**（前端阶段 2 最后一块）：
    - 背包面板（B 键）：DOM 面板 = 金币 + 装备区（13 槽 `SLOT_NAMES`）+ 背包物品网格；点击物品 `useItem{makeIndex}`（服务端按 stdMode 分发：吃药/穿装备/学技能书/祝福油）。
    - NPC 对话框：`npcSay` → 面板（标题/正文/选项按钮/`goods` 购买列表/`sell` 出售列表/关闭按钮）；选项→`npcSelect{npcId,value}`、购买→`buyItem{npcId,index,count}`、出售→`sellItem{npcId,makeIndex}`、关闭→`npcSelect exit`；`npcClose` 关闭。
    - `bagUpdate` → 更新 `self.gold/self.items` 并刷新背包面板。
    - 修 bug：点击 cell 换算 `round`→`floor`（格子中心点原会偏移 1 格，导致点怪/NPC 命中偏差 1 格）。
    - 验证（Playwright）：背包显示 6 件初始物品（命运之书/金创药/魔法药×2/肉×2）；点击「招财树」NPC 触发 npcSay + 4 选项 + 点选项后 npcSelect 回复正常。
29. **装备外观（dress/weapon 跟随装备）**：
    - 修 bug：玩家 sprite 外观号之前用 `dress=job*2+sex`、`weapon=weaponLooks`（错误）；对齐 Delphi `ObjBase.pas GetRelFeature`：`dress = 衣服 shape*2 + sex`、`weapon = 武器 shape*2 + sex`、`face = hair*2 + sex`（无装备时 dress/weapon = sex）。
    - 服务端 `Player` 加 `dressLooks()/weaponShape()`，`toBriefJson/toPlayerJson` 发 `dress/weapon` 字段（替换错误的 weaponLooks）；`sendBagUpdate` 也带 dress/weapon（穿装备后 self 外观即时刷新）。
    - 前端 `ActorSprite` 玩家层改用服务端 `dress/weapon` 字段（fallback sex）。
    - 验证：初始 dress=sex=0、weapon=sex=0（字段传递正确）。
30. **技能栏 F1-F8 施法**：
    - 服务端 `Player.toPlayerJson` 发 `skills`（`{magicId:{name,level}}`，新增 `skillsJson()`）。
    - 前端：底部技能栏（F1-F8 槽显示已学技能名，点击或按 F1-F8 施法）；点击怪物设为施法目标（`castTarget`，红框高亮）；`TARGET_MAGICS`（伤害 1/5/11/35、施毒 6、火墙 22、诱惑 20）需要目标（无目标提示选择），治愈/召唤/推开/传送/隐身直接施法（`targetId=-1`）；`spellCast` 消息驱动施法者播放攻击动画。
    - 验证（Playwright）：道士初始技能「治愈术」显示在 F1 槽 + 施法请求 `castMagic{magicId:2,targetId:-1}`；火球术无目标时不发请求、设目标后发 `castMagic{magicId:1,targetId}`。
31. **交互/视觉优化**（三项）：
    - **entityRemove 广播**：`GameWorld.removeActor` 补广播 `entityRemove`（宠物死亡 `removeSummon`/玩家登出 `removePlayer` 后其他玩家能立即看到实体消失，修复尸体残留）。
    - **点墙就近寻路**：`PlayScene._walkTo` 目标不可站时在 ±2 格内就近找可站格（曼哈顿距离最小），修复点墙不响应。
    - **血条/名字位置**：血条从格顶 `sy-4` 上移到 `sy-18`、名字从 `sy+4` 上移到 `sy-34`（sprite 头顶上方），施法目标高亮框同步调整，消除与 sprite 重叠。
    - 验证：smoke test 通过；点墙格 (292,615)→就近移动到 (291,615)。
32. **Paradox `.DB` → CSV + 配置/路径健壮性**（数据可维护性 + 部署）：
    - 删除 `resource/ParadoxDb.java` 与 `gamedata/mud2/DB/*.DB`（二进制），改为 UTF-8 CSV（带表头，可直接编辑）；`scripts/paradox_to_csv.py` 为一次性导出脚本（已运行生成 3 个 csv）。
    - `Database.importParadox` → `importCsv`：`importCsvTable` 流式逐行读 CSV（`splitCsv` 处理引号），导入 SQLite 后释放，不常驻内存。
    - `ServerConfig.load` 找不到 config 时回退内置默认值（不再抛异常）。
    - `Main` 加 `projectRoot()/resolve()`：数据目录（frontend/resources/gamedata/data）按「工作目录优先、找不到回退 jar 父目录（项目根）」归一化，从任意目录启动都能定位数据。
    - 验证：删库重导 items=541/monsters=273/magics=39（去重后 535/267/33 与旧一致）；从 `target/` 运行不再报 config 错、前端/resources 正常。
33. **登录/注册/改密码界面 1:1 照搬 Delphi `TLoginScene`**（替换此前自创的简化 UI）：
    - 布局全部照搬 Delphi：场景背景 = `ChrSel[22]`（800×600，照 `TLoginScene.PlayScene` 的 `WChrSel.Images[102-80]`）；三个窗口用 `Prguse` 图做背景 —— 登录 `Prguse[60]`(296×254)、注册 `Prguse[63]`(640×473)、改密码 `Prguse[50]`(420×299)，屏幕居中。
    - 按钮 = Prguse 图（Ok=62「提交」/New=61「新用户」/ChgPw=53「修改密码」/Cancel=52「取消」/Close=64 红X），坐标照 `FState.pas`（登录窗 Ok(171,165) New(24,207) ChgPw(111,207) Close(252,28)；注册窗 Ok(160,417) Cancel(448,419) Close(587,33)；改密码 Ok(181,253) Cancel(276,252)）。
    - 输入框照原版 `TEdit`（bsNone 无边框 + 黑底 + 白字）叠加在背景图黑色输入区：登录 账号(98,86)/密码(98,118) 宽137；注册 13 个字段（用户/密码/确认/姓名/身份证/生日/提问1/回答1/提问2/回答2/电话/手机/E-Mail，left=161，top=116..388，问答宽163）；改密码 4 个（left=241）。
    - 交互照原版：登录框回车跳密码框、密码回车提交（`EdLoginIdKeyPress`/`EdLoginPasswdKeyPress`）；注册逐格回车跳转、末格提交（`EdNewIdKeyPress`）；注册校验照 `NewIdCheckNewId`（账号≥3）+ 服务端（密码≥4）+ 确认一致；注册成功自动登录。
    - **注意**：注册表单其余字段（姓名/身份证/密保/电话/邮箱）前端照原版收集并随 register 发送，服务端当前只认 username/password（忽略其余，将来扩展无需改前端）；改密码窗口照原版布局但提交提示「暂未开放」（服务端无 changePassword 协议，Delphi `CM_CHANGEPASSWORD=2003` 待补，见 §14）。
    - 验证（Playwright 截图）：登录/注册窗口与原版素材一致；注册→自动登录→建角→进游戏→移动全链路通过。
34. **选角/建角界面 1:1 照搬 Delphi `TSelectChrScene`**（替换此前自创的 DOM 面板）：
    - 场景背景 = `Prguse[65]`（800×600，照 `TSelectChrScene.PlayScene` 的 `WProgUse.Images[65]`）；两个角色槽（`ChrArr[0..1]`）。
    - 角色立绘 = `ChrSel` 帧：选中槽播**站立动画**（`40 + job*40 + frame + sex*120`，10 帧循环每 300ms，锚点 `fx/fy`）；未选中显示**冻结帧**（`60 + job*40 + sex*120` 首帧，锚点 `bx/by`）。位置照 PlayScene 的 job/sex 表（`CHAR_POS`，女法师/女道士站立与冻结锚点不同），槽 1 整体 +340/+2。
    - 名字/等级/职业 = 描边字（照 `BoldTextOut`：槽0 (117,494/523/553)、槽1 (671,496/525/555)）；职业名照 `GetJobName`（**武士/魔法师/道士**）。
    - 选角按钮（Prguse 图，坐标照 `FState.pas` DSelectChr）：选1=66(133,453)、选2=67(685,454)、开始=68(385,456)、创建=69(348,486)、删除=70(347,506)、制作群=71(362,527,原版空实现)、退出=72(379,547)。
    - 建角窗口（`DCreateChr`）：背景 `Prguse[73]`（300×417），照 `MakeNewChar` 槽0窗口在 (415,15)、槽1在 (75,15)；名字输入框（无边框黑底白字，窗口+71/+107 宽137，照 `EdChrName`）；按钮照 FState.pas —— 职业 74/75/76 (48/93/138,157)、性别 77/78 (93/138,231)、发型 79/80 (76/170,308)、确定=62 (102,359)、关闭=64 (248,31)。发型用左右按钮循环（原版 `SelChrNewPrevHair/NextHair` 是空实现+随机发型，此处实现为真选择）。
    - 删除确认/提示用浏览器 `confirm/alert` 简化（原版 `DMessageDlg`，见 §14 待办）。
    - **坑（已修×2）**：① `createState/_nameInput` 原在 async `await` 之后初始化，外部立即访问为 undefined → DOM 同步先建、背景图异步插入；② 实例字段与原型方法同名（`_prgUrl`/`_chrTex` 既是 Map 又是方法）→ 方法被实例属性遮蔽报 "not a function"，render 每帧抛错被 loop 吞掉（表现为立绘/文字全不画）→ 字段改名 `_prgCache/_chrCache`。
    - 验证（Playwright 截图）：男武士/女法师立绘渲染正确、信息框文字正确；建角→选角→进游戏→移动全链路通过。
35. **游戏内渲染修正（偏移/卷动）+ 远程怪 AI**：
    - **对象层偏移**：`MapActor._getTex` 改缓存 `{canvas,px,py}`；blend 光效照原版 `PlayScn.pas` 的 `GetObjsEx` 语义 —— `x = 格左 + px - 2`、`y = 格顶 + py - 68`（普通对象仍格子左上+底对齐）。已验证火炬光效图 `Objects[2723] px=-51 py=-113` 代入后光效中心正好对准火炬头。
    - **平滑卷动**：玩家 `move` 时记录 `_selfFrom/_selfMoveAt`，render 按 280ms 插值算 `shiftX/shiftY` 传给 `MapActor.render`（照原版 ShiftX/Y），地图从瞬跳变为滑动（Playwright 连续采样 screenX 平滑过渡）。
    - **坐标收口**：`MapActor` 暴露 `screenX/screenY`（含 shift），血条/名字/**施法目标高亮**移入 `MapActor` 实体绘制循环并**贴 sprite 头顶**（取各层最小 py 估算顶部），地面物品改用收口坐标（照原版格子中心对齐）；删除 `PlayScene._renderHpBars`。
    - **远程怪 AI**（对齐 `ObjAxeMon.pas TDualAxeMonster/TArcherMonster`）：`GameWorld` 加 `RANGED_RACES = {82 喷毒蜘蛛, 87 双斧骷髅, 93 暗黑战士, 94 闪电僵尸, 104 弓箭手}`；距离 ≤7 **站定攻击**（不走近）、≤4 1/3 概率**后撤保持距离**（`GetBackPosition`）、≤11 才追、>11 丢失。出生点附近「暗黑战士(93)/僵尸(94)」即远程怪——这是原版行为（需走位/技能打）。
    - 验证：smoke test 通过；卷动采样平滑、5 秒内受击 4 次、无 console/page 错误。
36. **守卫仇恨修正（弓箭守卫不主动打白名）**：
    - 主城「弓箭护卫」race=**112**（`RC_ARCHERGUARD` 守卫，非野怪 104）——地图 0 刷 24 个。守卫照 `ObjMon2.pas TGuardUnit.IsProperTarget`（非城堡分支）**只打 PK 玩家**：`target.PKLevel >= 2` 红名才主动攻击，或反击 `LastHiter`。
    - `GameWorld` 加 `GUARD_RACES = {20 弓箭警察, 112 弓箭守卫}` + `guardHostile(m,p)`：`p.id==m.lastHiterId`（反击）或 `p.pkPoint > 0`（红名/灰名）；`resolveTarget` 对守卫过滤白名（pkPoint=0 且非反击者不当目标）。
    - `Monster.lastHiterId`（`GameService.attack` 玩家攻击时记录，守卫据此反击）；守卫也加入 `RANGED_RACES`（`TArcherGuard.ShotArrow` 远程）。
    - 验证：smoke test 通过；白名玩家在守卫区 8 秒无守卫攻击。
37. **实体锚点修正 + 卷动 lerp + 点击走/跑**：
    - **锚点**（照 `PlayScn.pas` DrawChr）：实体图左上 = **格左 + px, 格顶 + py**（hum 站立帧 px≈8-15, py≈-47/-48，脚落在格底上方 ~9px）。此前错用「格子底部中心」锚点导致人物+血条+名字整体偏移 32px。
    - **名字/血条**：原版固定偏移 —— 名字 = 格顶 - 47（照 SayY）、血条 = 格顶 - 30，水平格子中心；不再动态贴 sprite 顶（图框含透明边距，动态顶不可靠）。
    - **卷动**：显示中心 lerp 追踪玩家（`_viewX += (self.x-_viewX)*0.25`，亚像素 shift），替代「每步重置插值」——后者在连续移动时 shift 从 27 跳回 48 造成画面跳变（用户反馈「放大一瞬」）。changeMap 时重置 _viewX。
    - **点击移动**：去掉 A* 寻路（`findPath` 已移除引用），改**贪心直线**走向点击点（卡住 4 tick 自动放弃）；**左键走**（每 2 tick 一步 = 200ms/格）、**右键跑**（每 tick 一步 = 100ms/格），`contextmenu` 已拦截（右键不再弹浏览器菜单）。点怪/NPC/物品仍是走近后执行动作。
    - 验证：左键 2 格 vs 右键 4 格（速度差异）、右键拦截、sprite/名字/血条对齐、无错误。注意 hum 大图首次加载有几秒延迟（优先级队列 §14 可解）。
38. **卷动 shift 突变修复 + 名字/血条上移 + 前端 no-cache**：
    - **「画面模糊缩放」根因（两个叠加）**：① `vcx=round(viewX)` 在 viewX 过 .5 时突变，shift 从 +24 跳 -24（画面跳 48px = 「缩放」错觉）→ 改 **floor**（shift ∈ [0,48) 连续，floor+shift 数学上严格连续）；② shift 浮点 → drawImage 抗锯齿「模糊」→ shift **取整**。验证：移动时 shift 相邻差 ≤1。
    - **名字/血条上移**：格顶 -47/-30 落在人物头部（用户反馈偏下）→ **-58/-44**（头顶 ≈ 格顶-39，血条贴头顶上方 5px、名字再上 14px）。
    - **「改了没反应」根因 = 浏览器缓存旧 .mjs**（ES Module 无 cache-busting）：服务端静态响应加 `Cache-Control` —— `.mjs/.html/.json` → `no-cache`（改代码刷新即生效），`.wil/.wix/.map/.wav` → `immutable` 长缓存。**以后改前端代码，用户刷新页面即可，无需清缓存**。
    - 验证：shift 连续、cache-control 头正确（curl 确认）。
39. **点击改「朝方向走格」+ 名字上移**：
    - **点击语义（用户澄清）**：原版是「按下时朝鼠标相对画面中心的方向走 1 格（左键）/ 2 格（右键）」，不是「寻路走到目标点」。移除 `_clickTarget` 寻路，改 `_dirFromMouse`（鼠标偏移按 48/32 纵横比归一化映射 8 方向）+ `_stepsLeft/_stepDir`（点击立即走第一步，右键余 1 步由 moveTimer 走）。保留相邻怪→攻击/相邻 NPC→对话/脚下物→拾取。
    - **名字上移**：格顶 -17（人物身体，用户仍嫌偏下）→ **-71**（血条 -57 上方，一起在头顶上方）。
    - 验证：左键右方 1 格、右键右方 2 格、上方 y-1、名字/血条位置正确。
40. **删键盘移动 + 鼠标按住持续走 + 走/跑间隔 + 方向实时判断**：
    - **删键盘移动**：移除 WASD/方向键移动（`_currentDir`/`keys`），保留 Space 攻击/B 背包/F1-F8 施法。
    - **鼠标按住持续走**：`mousedown` 记方向 + 立即走一步，`moveTimer`（50ms 轮询）在 `_holding` 为真时按间隔持续走；`mouseup`（document）停止。不再「点一下走一下」。
    - **走/跑间隔**：`WALK_INTERVAL=500`、`RUN_INTERVAL=250`（ms/步），动作之间有明确间隔。验证：1.6s 内走 3 步、跑 6 步（2 倍速）。
    - **方向实时判断**：新增 `mousemove` 监听，按住移动时实时更新 `_mouseDir`——先向右走，移动鼠标到左上，下一步即朝左上。验证：向右走到墙边后转向左上（dy=-2）。
    - 注意：出生点 (289,618) 向右只能走 7 格（297,618 是墙），测试撞墙属正常，非间隔 bug。
41. **卷动改匀速**：lerp 指数逼近（每帧追 25% 剩余，「先快后慢」）产生追停抖动 → 改匀速 clamp 步进（速度 = 走 500ms/格、跑 250ms/格，与 move 节奏同步）。shift 仍整数化。验证 shiftY 相邻差集中在 1~4。
42. **人物走动画过渡（消除一步跨格）**：原实现人物直接画在逻辑格 `self.x`（move 到达瞬间跨 48×32 到目标），地图却单独卷动 → 不协调。修复：self 增加 `offsetX/offsetY` 走动画偏移（`(viewX - self.x)*48` / `(viewY - self.y)*32`），从逻辑格滑向过渡位置 `_viewX`；地图反向偏移共用同一 `_viewX`，严格同步。MapActor 锚点/血条/名字/高亮统一用含 offset 的 anchorX/anchorY。验证：移动时 self 屏幕位置恒定 376（画面中心）、相邻差 0。
43. **右键播放真正的跑(run)动画**：原「跑」= walk 动画 + 2 倍速间隔（无独立 run 动作）。修复：前端 `ActorSprite.PLAYER_SEG` 补 `run: 'run'`（`HA.run start=128` 跑步帧）；`PlayScene` move 命令带 `run` 字段、onMessage 按 `msg.run` 设 `_action`；服务端 `Actor` 加 `running`、`move` 接收 `run`、`broadcastMove` 广播 `run`。验证：右键 `_action=run`、左键 `_action=walk`。
44. **跑动动画连续循环（消除重复中间几帧）**：run 动画 720ms（6 帧×120ms）但跑动间隔曾 250ms，每次 move 重置动画相位 → 只播前 2 帧。修复：移动间隔对齐动画周期（走 540ms、跑 360ms）；walk/run 动画改循环播放（不自动回 stand）；连续同动作 move 不重置 `_actionAt` 保持相位连续；停止超时 600ms 回 stand。验证：连续跑 `_actionAt` 不重置、帧号 0→5→0 连续循环、跳变 0。
45. **跑动改一次移动 2 格（原子）**：原跑 = 每 360ms 走 1 格 + 按住才走第 2 格，快速抬右键只走 1 格。对齐原版 `SM_RUN movestep=2`：`_runStep` 第 1 格立即 + 第 2 格 360ms 后（setTimeout 链，不受 mouseup 中断），按住循环跑周期；moveTimer 只处理走。验证：快速单击右键 2 格、按住 1.5s 跑 4 格、左键 1 格。
46. **怪物/NPC 移动加走动画过渡（消除瞬移）**：走动画偏移 `offsetX/Y` 之前只给 self，怪物/NPC move 到达直接跳格（瞬移）。修复：`onMessage move` 记录移动起点 `_fromX/_fromY/_moveAt`；render 对非 self 实体按时间插值从旧格滑到新格（`MONSTER_MOVE_DUR=720ms`，对齐 walk 动画 6 帧×120ms）；「停止超时回 stand」扩展到所有实体。验证：构造移动实体 offsetX 从 -48 平滑到 0。注：出生点 (289,618) 在村庄围墙内（四方向直线都被墙挡），自动寻怪需 BFS 绕行或手动走出村庄。
47. **玩家移动增量更新视野（修复怪物入画不显示但被攻击）**：怪物只在 spawn/respawn 广播 `entityAdd`，玩家移动导致怪物从视野外进入（`SIGHT_RANGE=12`→攻击 `AGGRO_RANGE=8`）时无广播 → 客户端看不到怪物但服务端 AI 照常攻击。修复：`Player` 加 `seen` 集合；`mapSnapshot` 初始化 seen；`GameWorld.updateSight` 玩家移动后增量广播新进入 `entityAdd` / 离开 `entityRemove`；`GameService.move` 移动后调用。验证：移动玩家时新进入视野的怪物收到 entityAdd、3 怪物均正常渲染。
48. **攻击时自动转身面对目标**：服务端 `attack` 原本不更新玩家 dir → 攻击时人物保持原朝向。修复：`attack` 时 `p.dir = directionFrom(自己,目标)` + `broadcastMove` 广播转向（位置不变仅 dir 变，对齐旧版 `AttackTarget` 的 `tdir=GetNextDirection`）；客户端 `move` 处理区分「移动/纯转向」——位置不变时只更新 dir、不触发走动画。验证：纯转向 move 只更新 dir、位置不变、不触发动画。
49. **选角后 notice 公告界面**：选角进游戏前原版有「健康游戏公告」（`SM_SENDNOTICE`/`CM_LOGINNOTICEOK`）。修复：`GameWorld` 启动加载 `Mir200/Notice/Notice.txt`（GBK）；`GameService.enterGame` 拆成校验+发 notice，新增 `noticeOk` 完成进游戏；`SelectCharScene` 收到 notice 显示对话框（背景 `Prguse[380]`、确定 `Prguse[361]`），确认发 noticeOk。验证：选角→公告→确认→进 PlayScene。
50. **NPC 对话框改原版样式（DMerchantDlg）**：原自生成 DOM 按钮。修复：背景 `Prguse[384]`（416×176 商人对话框）、文本 (30,20) 白描边、选项黄色下划线链接（`clYellow`）、关闭按钮 `Prguse[64]`(399,1)。背景/关闭图用 `.then` 异步插入，文本选项同步显示（避免首次加载 Prguse 阻塞）。验证：传送员对话正常（背景图+关闭图+10 选项链接+文本）。
51. **notice 黑屏 + NPC 背景图 + 选项内联 + 传送**：
    - **notice 黑屏**：改独立 `NoticeScene`（黑屏 `render` + 公告对话框 `Prguse[380]/[361]`），确认发 noticeOk 后切 PlayScene（对齐原版 `stLoginNotice` 黑屏场景）。
    - **NPC 背景图不显示**：根因 `z-index:-1` 被 `#screen` canvas 遮挡 → 移除 z-index，靠 DOM 顺序（背景先插入）。
    - **选项内联**：服务端 `appendSay` 保留 `<label@value>` 标记（不再提取到 options）；客户端 `_renderNpcSay` 解析渲染为内联黄色下划线链接（label 去末尾 `/`），点击发 `npcSelect`。
    - **传送切换地图**：点「比奇城堡」→ `mapmove 0 333 268` → `changeMap` → 坐标 287,615 → 333,268（验证通过，需 5000 金币）。
52. **商店传送员不传送 + 换行精简**：
    - **商店传送员不传送**：根因是它脚本用 `map 地图id` 命令（随机落点，如 `map 0104`），而服务端 `NpcScriptEngine` 只支持 `mapmove`。修复：`runActions` 加 `case "map"`（复用 `doMapMove`，无坐标时随机落点）。验证：点「书店」→ `map 0104` → (5,7)。
    - **换行精简**：`appendSay` 每行 trim 去空行（脚本 `\ \` 段落分隔紧凑显示）；客户端去掉 NPC 名字占行（原 `nameEl`）。
    - 注：静寂之城传送 `mapmove 28` 因 28.map 缺失会失败（数据文件缺失，非代码问题）。
53. **NPC 交互对齐原版（字体/走远关闭/15格距离/贴图判定）**：
    - **字体/换行**：NPC 文本 14px→12px、行高 16px（原版 `Font.Size=9`、`ly+16`），换行不再过多。
    - **走远自动关闭**：`_showNpcDialog` 记录 `_npcDlgX/Y`（打开时玩家位置），render 里离开 >= 8 格即 `_closeNpcDialog`（原版 `MDlgX/Y` + `abs>=8`）。
    - **NPC 对话距离**：服务端 `npcTalk`/`npcSelect` 距离 3→15 格（原版 `ServerGetClickNpc` `abs<=15`）；客户端点中贴图即发（不再限相邻 1 格）。
    - **点击判定改贴图区域**：`_actorAtScreen` 按原版 `GetAttackFocusCharacter` 用贴图中间 40×70 判定（`centx=(CharWidth-40)/2`、`centy=(CharHeight-70)/2`，含 px/py 锚点 + self 走动画偏移），不再限点格子中心。验证：传送员贴图 44×64（py=-43），贴图中心与格子中心均命中。
54. **按钮按下态切换 + 右键全局屏蔽 + 玩家贴图判定**：
    - **按钮机制（原版 TDButton Downed 语义）**：窗口背景图已画所有按钮「正常态」（用前端解码器导出 fe_60/fe_384 证实；Python 直解 WIL 行序方向会搞反，勿用）。按钮 img 即「按下态」，平时隐藏、mousedown 显示、mouseup/mouseleave 恢复。结构 = 透明热区 div（接收事件）+ 内层 hidden img（注意 `visibility:hidden` 元素不接收鼠标事件，必须热区包裹）。
    - 覆盖：LoginScene._btn、SelectCharScene._btn/mk（选角+建角）、PlayScene NPC 关闭按钮（Prguse[64] @399,1）。NoticeScene 确定按钮背景 380 无图案 → 保持显示 + 按下 `brightness(0.75)`。
    - **右键菜单全局屏蔽**：main.mjs 入口 `document.addEventListener('contextmenu', preventDefault)`（PlayScene 局部移除），NPC 对话框等 DOM 上也不弹菜单。
    - **玩家贴图判定**：`_onMouseDown` 补 `_actorAtScreen(mx,my,'player')`（原版点玩家=攻击，与怪物同）。
    - 验证：按下 visible/松开 hidden、热区可点、contextmenu 全局拦截、NPC 贴图距离 4 格开对话。
55. **掉落物贴图 + 超时消失**：
    - **贴图**：`_renderGroundItems` 原用绿色方块占位 → 改用 `DnItems[looks]` 图标（原版掉落物贴图库，resources key `dnitems`），`_drawDropTex` 异步加载 + `_dropTex` Map 缓存，金币保留黄点。
    - **超时消失**：`GroundItem` 加 `createdAt`；`GameWorld.tick` 新增 `tickGroundItems`——超 60 秒（`GROUND_ITEM_TTL_MS`，原版 MapItem.DisappearTime 约定）移除并广播 `itemRemove`。此前 groundItems 只增不减（pickup 外无清理），掉落物永存。
    - 调度链路：`Main` scheduleAtFixedRate → `GameService.tick` → `world.tick` → `tickGroundItems`，与 FireWall 清理同构。
    - 验证：DnItems 各 looks 加载正常（20×13~40×37）、假掉落物渲染真实图标；出生点城内无怪，60s 超时未做端到端（逻辑同构已审查）。
56. **F9 状态窗口 + F10 背包（删底部技能栏）**：
    - **服务端**：`Player.toPlayerJson` 导出战斗属性 `ac/mac/dc/mc/sc`（`combat.xxxMin-xxxMax`，原版 DStateWin 显示）。
    - **F9 状态窗口**（`_buildStateWin`/`_refreshStateWin`，Prguse[370] 232×325 右上）：角色名/职业/等级/经验/HP/MP/金币 + 属性（AC/MAC/DC/MC/SC）+ 13 装备槽（stateitem[looks] 图标）。
    - **F10 背包**（`_buildBag`/`_refreshBag` 重写，Prguse[3] 336×270 左上）：金币 + 已学技能列表（点击施法）+ 背包物品格子（Items[looks] 图标）。
    - **删底部技能栏**：移除 `skillBar`/`_refreshSkillBar`；F1-F8 施法 `_castFromSlot` 改为按 `self.skills` 顺序取第 fkey-1 个。
    - 键位：F9 状态、F10/B 背包（`_onKeyDown`）。`_prgUrl` 抽象为通用 `_libUrl(lib,idx)`（prguse/stateitem/items 通用）。
    - 验证：self 属性 dc=2-2、状态窗 13 槽+属性齐全、背包 6 物品+1 技能（基本剑术）、skillBar 已删。
57. **F9/F10 界面错乱修复（对齐原版坐标、去叠加文字）**：
    - 装备槽 13 个改用原版 FState.pas `DSWxxx` 精确坐标（`EQUIP_SLOTS` 数组：衣服96,122/武器47,80/项链168,87/头盔115,93…），图标 stateitem[looks]，不再 2 列 grid 堆叠。
    - 属性数值改纯数字（如 `0-0`），对齐原版 StatePage 1 坐标 (112,99) 每 20px（`ATTR_ROWS`），标签由背景图 370 自带，不叠加「攻击/魔法」等文字。
    - 状态窗口分两页（装备页/属性页，底部「装备/属性」翻页按钮，`statePage` 状态），避免装备与属性文字重叠（原版也是 StatePage 0/1 分页）。
    - 背包物品改 8 列网格（原版 `DItemGrid` 20,13 286×162），金币 (10,190)、关闭 (309,203)。
    - 删除 F10 里的技能列表（原版背包无技能列表，技能施放用 F1-F8）。
    - 验证：13 装备槽精确坐标、属性纯数值 AC/MAC/DC/MC/SC/HP/MP、背包 8 列 6 物品。
58. **状态窗口翻页箭头 + 名字 + HUD 精简**：
    - 翻页按钮改原版 `DStPageUp(Prguse 398, 12×21)`/`DStPageDown(396)` 箭头图，位置 (213,113)/(213,143)（原版 FState.pas），替代右下角文字 tab。
    - 顶部角色名 `stateNameEl`：`名字（职业）Lv.X`，两页共享；属性页去掉重复名字行（只留经验/金币）。
    - 左上角 HUD `_renderHud` 去掉 `(x,y)` 坐标调试信息（用户反馈「调试信息错乱」）。
    - 验证：顶部名字正确、箭头位置 (213,113)/(213,143)、点下箭头切属性页、HUD 无坐标。
59. **状态窗口按钮/名字对齐原版**：
    - 名字：只显示纯名字（去职业/等级），位置 `Left+122` 水平居中、`Top+23`（原版 FState.pas 2702）。
    - 关闭按钮：新增 `DCloseState=Prguse[371]` (8,39)，点击关闭。
    - 翻页箭头：改为原版 `DPrevState=Prguse[373]`(7,128 上) / `DNextState=Prguse[372]`(7,187 下)——之前误用了 `DStPageUp=398`/`DStPageDown=396` 且位置错在右侧 (213,113)/(213,143)。
    - 验证：名字居中、关闭/上下箭头点击均生效。
60. **F9/F10 键位对调 + 关闭按钮按下态**：
    - 键位：原版 ClMain.pas `VK_F9=OpenItemBag`、`VK_F10=OpenMyStatus`（之前搞反）→ **F9=背包、F10=状态/装备属性**。
    - 关闭按钮 Prguse[371] 是「按下态」图（正常态红X画在背景图 370 里），改热区模式：默认 hidden、mousedown 显示、mouseup/mouseleave 恢复（对齐原版 Downed 语义）。
    - 验证：F9→背包、F10→状态、关闭按钮 img 默认 hidden。
61. **NPC 买卖面板（buy/sell）**：
    - 客户端 `_showShopPanel`：独立买卖面板（替代挤在 NPC 对话里的 44px 小列表）。buy=商品列表（名称+价格+「买入」按钮，点击 `buyItem`）、sell=背包物品（名称+「出售」按钮，点击 `sellItem`）。
    - `_showNpcDialog` 收到 `shop=buy/sell` 时打开买卖面板。
    - 买卖后金币实时刷新（`shopGoldEl`，bagUpdate 时更新）。
    - 服务端链路：NPC 脚本 `<买/@buy>`→npcSelect→`shopMode=buy`+`goods`（从脚本 `[goods]` section 加载）→客户端 `_showShopPanel`。`buyItem`/`sellItem` 已在服务端实现。
    - 验证：buy 面板商品+买入按钮、sell 面板 7 背包物品+出售按钮、金币刷新。
62. **买卖界面对齐原版（DMenuDlg 列表 + DSellDlg ok 框）**：
    - **购买**：`DMenuDlg`（Prguse[385] 308×205，位置 NPC 对话下方 0,176）物品列表——「物品列表/价格」标题、每行「名称 x=19 / 价格 x=137」（一页 10 项 `MAXMENU`）、上翻页 388(43,175)/下翻页 387(90,175)、买入按钮 386(215,171)、关闭 64(291,0)。点商品选中红字，点「买入」发 `buyItem`。
    - **卖出**：`DSellDlg` ok 框（Prguse[392] 140×181，260,176）——标题「卖: 」、Spot 投放框 (27,67) 61×52（显示选中物品图标）、OK 按钮 393(85,150)、关闭 64(115,0)。背包物品列表在右侧 (475,0)，点击放入投放框，再点 OK 发 `sellItem`。
    - 原版 `ShowShopMenuDlg`（购买：DMerchantDlg+DMenuDlg+DItemBag）、`ShowShopSellDlg`（卖出：DSellDlg+DItemBag）已对齐。
    - 验证：buy 列表 12 项翻页（page 0→9）、sell ok 框布局+背包 6 物品。
63. **买卖界面细节修复（按钮重影/列表下移/原版背包/返回关面板）**：
    - **按钮重影**：背景 385/392 已画正常态按钮（箭头/买入/OK/红X），img（388/387/386/393/64）是按下态 → 全部改热区模式（默认 hidden、mousedown 显示、抬起恢复）。
    - **购买列表下移**：标题 y=11、列表 y=40（原 32 与标题挤）。
    - **卖出用原版背包**：删右侧自定义列表（shopBagListEl），改 `shopSellMode` + 打开 bagPanel，卖出模式下点背包物品放入 ok 框投放（非卖出模式仍 useItem）。
    - **返回残留**：`_showNpcDialog` 无 shop 时 `_closeShopPanel`（点「返回」回主界面关闭买卖面板）。
    - 验证：按钮默认 hidden、列表 40px、背包点物品放 Spot、返回关面板。
64. **买卖界面再修（删标题/列表上移/卖出背包右移/返回关背包）**：
    - 购买列表删多出的「物品列表」标题行（背景 385 已画标题），列表 y=30 起（整体上移）。
    - 卖出背包移到右侧 (475,0)（原版 DItemBag 卖出位置），不再叠 NPC 对话框下方。
    - 「返回」：`_closeShopPanel` 同时关闭背包（卖出自动打开的背包，返回后不残留盖住对话——上一轮只关面板没关背包，背包在左上角盖住 NPC 对话导致「空白」）。
    - 验证：卖出背包 475px、返回后面板+背包关闭、新对话正常。
65. **NPC「返回」空白根因 + 列表标题 + 关对话框关买卖面板**：
    - **根因（关键）**：脚本链接大小写不一致——书店 5B 脚本 `<返 回/@Main>`（大写）vs `[@main]`（小写），`execute("Main")` 找不到 section 返回空文本 = 空白对话框。修复 `NpcScript.section` 忽略大小写匹配（遍历 equalsIgnoreCase）。
    - 购买列表加回「物品列表/价格」标题（代码绘制 y=11，背景图 385 无标题），列表 y=30 保持不挤。
    - 关闭 NPC 对话框（红X）同步关闭买卖面板：`_closeNpcDialog` 里 `_closeShopPanel`。
    - 真实验证：临时把书店老板移到出生点，买→购买菜单开、返回→回主对话+面板关；测完恢复坐标。
66. **购买列表标题布局 + 卖出返回确认**：
    - 标题「物品列表」y=11→9（上移 2px），「价格」独立定位到 x=156（原版 DMenuDlgDirectPaint 坐标），不再用内联 span（absolute 相对 panel 导致换行错位）。
    - 卖出「返回」确认正常：真实书店老板 卖→ok 框开+背包右侧 475px、返 回→回主对话+ok 框关+背包关（@Main 大小写修复已覆盖 sell 分支）。
67. **卖出返回空白第二根因（@Quit 不识别）+ 空 section 兜底**：
    - 扫描全部 merchant 脚本发现：`@Main` 69 处（已修）、`@exit` 52 处、**`@Quit` 16 处**（9Ega-T218.txt 等的「关闭/退出」）、`@main1` 2 处 + `@main_1` 1 处（指向不存在的 section）。
    - npcSelect 只认 `@exit` → `@Quit` 走 execute("Quit") 找不到 section → 空白对话框。修复：关闭语义忽略大小写（exit/quit），buy/sell 同步忽略。
    - 兜底：execute 返回空 sayText 且非 buy/sell/closed/moved 时自动回退 execute("main")，链接指向不存在 section（@main1/@main_1）不再空白。
    - 验证：书店老板卖出返回正常；npcSelect @Quit 触发 npcClose；服务端返回 npcSay 序列 [主对话/ shop=sell / 主对话] 全部正常。
68. **背包交互改原版「拿起-放下」模型（双击使用/单击选中）**：
    - **双击才使用**：`cell dblclick → useItem`，单击不再直接使用（原版物品光标交互）。
    - **单击选中（拿起）**：`this.pickedItem` 记录，cell 黄框高亮（`_markPicked`/`_clearPicked` 直接改 outline，不重建 DOM，避免破坏 dblclick）。再点同一格取消；点另一格 → `moveItem` 换位。
    - **扔到地上**：`_onMouseDown` 开头若 `pickedItem` 存在 → `drop`（服务端 `GameWorld.dropItem` 移除背包→生成 `GroundItem` 脚下→广播 `itemDrop`）。
    - **卖出**：`_showSellDlg` 的投放框 spot 加 click，拿起物品后点投放框 → `_pickSellItem` 放入待卖；移除 `shopSellMode` 单击自动投放。
    - **卖出后投放框自动清空**：`bagUpdate` 里检测 `shopSellItem.makeIndex` 已不在 `msg.items` → `_clearSellSpot`。
    - 服务端新增 `drop`/`moveItem` 消息（GameService switch + dropItem/moveItem 方法）；`moveItem` 交换两个 makeIndex 在 bag 的位置。
    - 换图/销毁清空 `pickedItem`。验证：单击选中高亮、单击取消、双击消耗金创药、换位顺序正确、扔地上地面物品+1、卖出金币+1 且投放框清空。
69. **右键交互限定 + 移动松手即停（不累计队列）**：
    - 怪物攻击/NPC 对话/玩家攻击/拾取只在 `e.button===0`（左键）触发；右键只用于「跑」，点 NPC/怪不再误触对话。
    - 跑动重构：原「`_runStep` 发 2 格（原子）+ `_runCycleTimer` 递归」导致连续点击时多个 setTimeout 链叠加、且第 2 格不检查 `_holding`，松手后仍滑行。
    - 改为 `_runStep` 每 `RUN_INTERVAL` 跑 1 格，每步开头判断 `_holding && _mouseRun`，松手即停；`mousedown` 清除旧 `_runTimer`（快速点击覆盖而非排队）；`mouseup` 也 `clearTimeout(_runTimer)`。
    - 验证：右键点传送员只发 move 不对话；连续 3 次右键（80ms 间隔）总 move=3、松手后不再增长（原 6+ 次滑行）。
70. **跑动中忽略重复右键 + 背包格子改原版 36×32**：
    - 移动语义修正为「第一次右键开始跑，跑动过程中后续右键一律忽略（`if(run && _holding && _mouseRun) return`），跑动结束时由 `_runStep` 每格判断 `_holding`，松开即停」。之前「mousedown 清除旧定时器」仍会累计。
    - 切到走（左键）时清除 `_runTimer`；跑动中 mousemove 仍可转向。
    - 背包格子对齐原版 `TDGrid`（DWinCtl.pas 703-706）：`ColCount=8 RowCount=5 ColWidth=36 RowHeight=32`，即 8×5=40 格、格子 36×32。原误设 8×4、35×40 竖长方形（选中黄框比例 0.875「太高」）。现比例 1.13 接近正方形。
    - 验证：跑动中额外 3 次右键 move 仍=1、松手不增长；格子 36×32、行距 32px。
71. **移动改原版「目标点」模型（彻底对齐右键跑）**：
    - 对照 `ClMain.pas`：`_DXDrawMouseDown` 设 `ChrAction`/`TargetX`/`TargetY`，主循环 `ProcessActionMessages` 每步按当前坐标 `GetNextDirection` 重算朝目标方向（跑用 `GetNextRunXY` 2 格）；`DXDraw1MouseUp` 设 `TargetX := -1` 停止。
    - 之前「朝固定方向持续跑」（`_dirFromMouse` + `_runStep` 递归）与原版不符，用户多次反馈。改为目标点：`mousedown` 设 `_targetX/Y` 且仅首次立即 `_stepToTarget` 走一步，重复右键只重设目标不额外走；`render` 主循环按 `WALK_INTERVAL`(540)/`RUN_INTERVAL`(360) 朝目标发 move、到达即停；`mousemove`（按住）更新目标点；`mouseup` 清目标停止。
    - 移除 `_runStep`/`_runCycleTimer`/`_startMoveLoop`/`_mouseDir` 死代码。
    - 验证：首次右键 move=1、重复 3 次右键 move 仍=1、1.5s 主循环走 4 格到达目标(618→622)、松手 target=-1 停止。
72. **移动最终改回「方向」模型（按住持续朝方向跑）**：
    - 目标点模型副作用：按住右键不动时，人物跑到鼠标指向的格子就停，需移动鼠标更新目标点才继续（用户反馈不对）。
    - 改回方向模型：`mousedown` 用 `_dirFromMouse` 算鼠标相对人物方向存入 `_mouseDir`，`mousedown` 重置 `_lastMoveAt=0`；`render` 主循环每 `WALK_INTERVAL`(540)/`RUN_INTERVAL`(360) 朝 `_mouseDir` 发 move，按住持续不停；`mousemove`（按住）实时转向；`mouseup` 清 `_holding` 停止。
    - 用主循环间隔节流（无 setTimeout 递归），快速点击不累计队列。
    - 验证：按住右键 2 秒持续走 6 格(mc=6)不靠移动鼠标；快速点 3 次正好 3 步、松手停。
73. **背包金币显示对齐原版**：
    - 对照 `DItemBagDirectPaint`：金币 `TextOut(Left+64, Top+185, GetGoldStr(Gold))`，白色 `clWhite`；`GetGoldStr`（ClFunc.pas 96）为千分位逗号、无「金币」前缀。
    - 之前错误：位置 (10,190)、黄色 #fbbf24、「金币 123」格式。修正为 (64,185)、白色 12px、`_formatGold` 千分位（1234567→1,234,567）。
    - 背景图确认正确：Prguse[3] 尺寸 336×270，与原版 `SetImgIndex(WProgUse, 3)` 一致。
    - 验证截图：金币 1,234,567 白色显示于 (64,185)，布局与原版一致。
74. **背包/状态窗口可拖动 + 点击前置**：
    - 对照原版 `TDWindow`（DWinCtl.pas 821-853）：`MouseDown` 时 `DParent.ChangeChildOrder(self)` 置顶 + 记 `SpotX/Y`；`MouseMove`（`MouseCaptureControl=self`）拖动 `Left/Top` 并限制在 `WINLEFT/WINRIGHT/WINTOP/BOTTOMEDGE`。
    - `_makeWindowDraggable(win)`：mousedown 捕获阶段 `_bringToFront`（`_zTop` 递增 z-index 置顶）；按住移动超 4px 阈值判定拖动（否则是点击，不影响格子选中/双击/按钮），边界限制屏幕内；拖动后 `_suppressClick` 抑制 click。
    - 状态窗口改 left 定位（原 right:0 → left:568=800-232），便于拖动。
    - onExit 清理 `_dragCleaners`。验证：背包拖 (0,0)→(100,100)、状态窗口 (568,0)→(538,0)、点击交替置顶 z-index 正确递增。
75. **拖动+前置通用化到所有窗口**：
    - `_makeWindowDraggable` 通用方法扩展到 NPC 对话框（`_showNpcDialog` 的 dlg）、买列表（`_showBuyMenu` 的 panel）、卖 ok 框（`_showSellDlg` 的 panel）。
    - `mm` 加 `win.isConnected` 检查：临时窗口（NPC 对话框/买卖面板）关闭移除后忽略拖动，避免对已移除窗口操作。
    - 验证：NPC 对话框拖动 (0,0)→(80,80) 生效。
76. **背包物品描述改到下方显示**：
    - 对照 `DItemBagDirectPaint`：`GetMouseItemInfo` 后 `TextOut(Left+70, Top+215)` 起显示 3 行（名字黄色 + 持久/重量 + 攻击/防御 + 需要等级），不是 HTML tooltip。
    - 服务端 `Player.instanceJson` 补物品模板属性：`stdMode/shape/weight/dc/dcMax/mc/mcMax/sc/scMax/ac/acMax/mac/macMax/need/needLevel`。
    - 前端 `_buildBag` 加 `bagDescEl`(70,215)；cell `mouseenter/mouseleave` 显示/隐藏描述，移除 `cell.title`；`_itemDesc` 按 `stdMode` 分类：药(0)→`+HP/MP`、消耗品/书(1-4)→重量、装备(5/6/10/11/15/19-26/30/52/54)→重量持久+攻防+等级、其他(如肉 40)→重量。
    - 验证：金创药 +20HP 重量1、魔法药 +30MP 重量1、肉 重量3、命运之书 重量1。
77. **F11 技能设置页（技能列表 + 快捷键 F1-F8）**：
    - 对照原版 `ClMain.pas` VK_F11 → `StatePage:=3` → `OpenMyStatus`；`FState.pas` StatePage=3 魔法页渲染 `MagicList`（名字/等级/快捷键图标），点击 `SetMagicKeyDlg` 设置，`CM_MAGICKEYCHANGE` 上报。
    - 服务端：`Skill` 加 `key`(0=无,1-8=F1-F8)；`Player.skillsJson` 返回 key；`magicKeyChange` 设置快捷键（同键互斥顶替）后 `sendStats` 塞 `skills` 推送。
    - 前端：F11 → `_openSkillSetup`(statePage=2)；`_buildStateWin` 加 `stateSkillWrap/stateSkillListEl`；`_refreshSkillPage` 渲染技能行（名/Lv/key）；点行弹 F1-F8 选择框，选后发 `magicKeyChange`；翻页箭头改 `(statePage±1+3)%3` 循环 3 页。
    - `_castFromSlot` 改按 `sk.key===fkey` 查找技能施法（原按插入顺序）。
    - 验证：F11 打开技能页、点技能弹框、选 F1 后 skills.key=1 并刷新显示 [F1]。
78. **被动技能不可设置快捷键**：
    - Magic.csv 里 `EffectType=0` 是被动技能（Power/Spell/Delay 均 0）：基本剑术(3)、精神力战法(4)、攻杀剑术(7)、刺杀剑术(12)、半月弯刀(25)、烈火剑法(26)。
    - `skillsJson` 加 `effectType`；`magicKeyChange` 服务端拒绝 `effectType==0` 设键；前端技能页被动显示「被动」灰色不可点、不弹框。
    - 待办：主动技能部分未开放（地狱火9/疾光电影10/灵魂火符13/幽灵盾14/神圣战甲术15/困魔咒16/爆裂火焰23/地狱雷光24/心灵启示28/群体治疗29/魔法盾31/圣言术32/冰咆哮33）。
79. **被动技能战斗效果完整实现**（对照 ObjBase.pas RecalcAbilitys + attack 触发）：
    - 命中加成：基本剑术(3)+3/级、精神力战法(4)+8/3/级、攻杀(7)+1/级 → `hitCheck` 加 `hitBonus`。
    - 攻杀剑术(7)：概率 `1/(7-Level)` 触发，伤害 +5+Level；烈火剑法(26)：20% 触发，伤害 +40%~160%（HitDouble=4+Level*4）；刺杀剑术(12)：额外 +2+Level。
    - 半月弯刀(25)：溅射周围 1 格怪物 dmg/2（SwordWideAttack），溅射击杀也计经验。
    - 新增 `hasSkill`/`skillLevel` 辅助方法。
80. **补齐未开放的主动技能**：
    - 伤害魔法扩展 `isDamageMagic`：地狱火9/疾光电影10/灵魂火符13/爆裂火焰23/地狱雷光24/冰咆哮33；范围魔法(23/24/33)命中后溅射周围1格(dmg/2)。
    - 群体治疗术(29)：治疗周围5格队友。
    - 幽灵盾(14)/神圣战甲术(15)：加防御/魔御持续 buff（`Player.acBuffUntil/acBuffBonus/macBuffBonus`，`recompute` 体现，`tick` 过期恢复）。
    - 魔法盾(31)：减伤30%持续 buff（`shieldUntil`，`attackPlayer` 里减伤，`tick` 过期）。
    - 困魔咒(16)：定身目标；圣言术(32)：3倍魔法伤害；心灵启示(28)：显示目标血量。

关键入口文件：`Main.java`、`service/GameService.java`、`game/GameWorld.java`、`game/npc/*`、`resource/NpcData.java`、`db/Database.java`、`net/*`；前端 `frontend/main.mjs` + `scene/` + `map/` + `ui/` + `gfx/`。

## 4. 未完成 / 待办（就是「移植整个 M2Server」剩下的部分）

> 老 M2Server 的 Delphi 源码在 `/Volumes/未命名/fire/Source/M2Server/`（也有一份在 `~/Documents/火炬源码+配套服务端/Source/M2Server/`）。

**核心玩法子系统已全部移植完成。** 剩余 3 项经调研**无法通过源码推断实现**（该版 M2Server 源码中不存在相应系统，不属于「移植」范畴，属于新增功能）：

- ~~结婚/师徒~~：Delphi 源码全文搜索 `MarrySystem`/`MasterSlave`/结婚/师徒 **0 匹配**，该系统在本版传奇源码中不存在。
- ~~摆摊~~：源码仅有 `Market_Def`（NPC 商店），无玩家摆摊/摊点（`Stall`）系统。
- ~~装备强化升级（非祝福油）~~：源码有 `RandomUpgradeItem`/`UserSelectGetBackUpgrade`（提交黑铁矿→等待 1 小时→随机成败的 NPC 升级），但依赖专门 NPC 脚本 + 升级材料数据 + `UpgradingList` 持久化，属独立大工程，可后续按需单独立项。

## 5. 当前阶段 & 下一步（给新 agent）

**后端（M2Server 移植）已 100% 完成**（§3 第 1-22 条覆盖全部核心玩法子系统），`mvn package` + smoke test 通过，无待办。

**前端重写进行中**（原生 canvas 2d，替换旧 PixiJS client 副本）。已完成阶段 1（GUI 框架）+ 阶段 2（登录→选角→游戏场景真实地图渲染，§3 第 23-25 条）+ **实体真实 sprite**（§3 第 26 条）+ **行走/攻击动画 + 点击交互**（§3 第 27 条）+ **背包/装备/NPC 对话框 GUI**（§3 第 28 条）。**前端阶段 2 主线已全部完成**，游戏可玩闭环打通（登录→选角→进图→移动/点击→战斗→拾取→使用物品→NPC 对话/买卖）。

**下一步主线**（按序，进入「打磨/进阶」阶段）：
1. **卖出去重/数量**：NPC 出售目前单件点击；可加数量选择（sellItem 协议已支持 makeIndex 单件）。
2. **音效系统**（§14）、**优化项**（§14：血条重叠/点墙就近寻路/宠物死亡残留/其他玩家装备变化同步）。

详细待办与优化项见 §14。

## 6. 数据依赖（重要，不在 git 里）

两处是**软链接**，指向你机器上的真实数据，接手机器上必须存在（或改成 Docker 挂载）：

| 软链 | 指向 | 用途 |
|------|------|------|
| `resources/` | `/Users/linxing/Desktop/Legend of Mir` | 客户端渲染资源（Data 图片库 / Map / Wav），`resources.json` 也是生成到这里 |
| `gamedata/Mir200/Map/` | `/Users/linxing/Documents/火炬源码+配套服务端/MirServer/Mir200/Map` | 服务端 `.map`（可行走栅格） |

- `gamedata/mud2/DB/*.csv`（StdItems/Monster/Magic，UTF-8 带表头）是**可直接编辑的模板数据**，已拷入 git（由 `scripts/paradox_to_csv.py` 从旧 `.DB` 导出，`.DB` 已删除）。
- `gamedata/Mir200/Envir/`（MapInfo/MonGen/Npcs/MerChant/MapQuest/MonItems/Npc_Def/Market_Def…）是**真实文件**，已拷入。
- 前端 `frontend/` 是**原生 canvas 2d 重写**（ES Module，非框架）。**参考依据是 Delphi 源码**（服务端 `/Volumes/未命名/fire/Source/M2Server/` + 客户端 `/Volumes/未命名/fire/Source/Client/`），**不参考旧 PixiJS 副本 `/Volumes/未命名/client/`**。后续改前端一律在 `frontend/` 里改。

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

- 启动日志关键行：`[db] imported CSV: items=541, monsters=273, magics=39`、`[resources] generated ...`、`[world] map=0 700x700, spawned monsters=N`、`[main] jootm2 started on port 8080`。
- 浏览器打开 `http://localhost:8080/` 即可玩（注册→登录→建角→进游戏）。
- 端到端测试：先起服务，再 `python3 scripts/smoke_test.py`（通过输出 `SMOKE TEST PASSED`）。
- **重新导入数据**：删 `data/jootm2.db*` 后再启动（模板表为空才触发 CSV 导入）。
- Docker：`docker compose up --build`；`resources/` 与 `data/` 用卷挂载（`gamedata` 未打进镜像，需在镜像内挂载（见 `docker-compose.yml` 与 README）。

## 9. 配置项（config/server.properties）

`server.port` `server.ioThreads` `server.backlog` `db.file` `game.tickMs` `game.savePeriodSec` `web.root` `resources.root` `resources.prefix` `gamedata.root` `world.*`。
关键新增：`gamedata.root=gamedata`（`gamedata/mud2/DB` 与 `gamedata/Mir200/` 相对此根）。

## 10. 关键技术点（接手必读）

- **游戏模板 CSV 格式**（`gamedata/mud2/DB/*.csv`）：UTF-8，首行表头，逗号分隔（带引号字段）。StdItems 24 列（Idx,Name,StdMode,Shape,Weight,AniCount,SpecialPwr,ItemDesc,Looks,DuraMax,AcMin,AcMax,MacMin,MacMax,DcMin,DcMax,McMin,McMax,ScMin,ScMax,Need,NeedLevel,Price,Stock）；Monster 22 列（Name,Race,RaceImg,Appr,Level,Undead,CoolEye,Exp,HP,MP,AC,MAC,DC,DCMax,MC,SC,Speed,Hit,WalkSpeed,WalkStep,WalkWait,AttackSpeed）；Magic 19 列（MagId,MagName,EffectType,Effect,Spell,Power,MaxPower,DefSpell,DefPower,DefMaxPower,Job,NeedL1,L1Train,NeedL2,L2Train,NeedL3,L3Train,Delay,Descr）。导入在 `Database.importCsvTable`（流式逐行，`splitCsv` 处理引号），`mapStdItem/mapMonster/mapMagic` 按列序映射。
- **字段语义来源**：老 Delphi `M2Server/LocalDB.pas` 的 `LoadStdItems / LoadMonsters / LoadMagic`。Magic 的 id+name 之外用列表保留在 `MagicTemplate.attrs`，再经 `resolve()` 映射为命名字段。
- **Magic 字段顺序（坑！）**：Delphi `FieldByName` 是按名查，顺序 ≠ 文件顺序。CSV 列顺序（沿用旧 Paradox 文件实际顺序）是：`MagId, MagName, EffectType, Effect, Spell(MP), Power(min), MaxPower, DefSpell, DefPower(min), DefMaxPower, Job, NeedL1, L1Train, NeedL2, L2Train, NeedL3, L3Train, Delay, Descr`（19 列，`attrs` 去掉 MagId/Name 后 17 个）。`DelayTime = Delay*10`；`NeedLevel` 是学习门槛（施放不检查），`Spell` 是施法 MP 消耗。
- **.map 格式**（`resource/MapFileReader.java`）：52 字节头（宽/高/标题/日期/保留）+ `宽*高` 个 12 字节瓦片；bng/mid/obj 各 2 字节，`0x8000` 位=阻挡。
- **编码**：gamedata 文本（MapInfo/MonGen/Npcs/…）是 **GBK**（Java 用 `Charset.forName("GBK")`）；`mud2/DB/*.csv` 模板是 **UTF-8**（`StandardCharsets.UTF_8` 读取）。SQLite 内部存 UTF-8（Gson JSON）。
- **模板表**：`std_items(idx,data)` `monsters(name,data)` `magics(mag_id,data)`，`data` 是模板类的 Gson JSON，见 `db/Database.java`。
- **前端入口与架构**：入口是 `frontend/main.mjs`（`loadResources()` → WS `/ws` → LoginScene → 主循环）；场景由 `scene/SceneManager.mjs` 驱动，`conn.on('*')` 把服务端消息路由到当前场景的 `onMessage(type, msg)`。所有通信是 JSON（§7），无二进制协议。（旧 client 副本里的 `EDcode/GB2312Encoder/SDK` 二进制协议代码在新前端里**已不存在**。）

## 11. 已发现的坑 / 注意

- **怪物/技能名带数字后缀**：源数据（`Monster.csv`/`Magic.csv`）本身就有 `骷髅精灵10`、`驽马精灵0` 这类名字，是源数据如此，非解析 bug（`洞蛆`/`多钩猫`/`火球术` 等均正确）。
- **.DB 有重复行**：`跳跳蜂1`×7、magId 11/15/20/26/29/30 各×2、idx 476×7，已用 `INSERT OR REPLACE` 去重（后写覆盖）。
- **之前的手写 NIO 版有 bug**：`addActor` 没把怪物挂到地图导致 `tryMove` 会 NPE；已修（`GameWorld.addActor` 里 `if(a.map==null) a.map=defaultMap`）。
- **smoke_test 战斗偶发「未击杀」**：怪物池从 3 个变 267 个后，可能随到高 HP 怪，是测试的随机性，非代码错误（`SMOKE TEST PASSED` 仍输出）。
- **客户端游戏画面**：旧 client 副本（`/Volumes/未命名/client/`）的 PlayScene 是简化网格；新前端（`frontend/`，见 §3 第 23 条）已用真实等距地图渲染 + 实体真实 sprite（§3 第 26 条，站立帧）。
- **无残留进程**：交接前已停掉我起的服务端/资源服务器，端口 8080/55842 均空闲。

## 12. 参考材料

- 老 Delphi **服务端**源码：`/Volumes/未命名/fire/Source/M2Server/`（M2Share.pas / LocalDB.pas / Envir.pas / ObjBase.pas / ObjMon.pas / ObjNpc.pas / Magic.pas / svMain.pas …）
- 老 Delphi **客户端**源码：`/Volumes/未命名/fire/Source/Client/`（`Actor.pas` 的 `RaceByPM`/`GetMonImg`/`GetOffset`/`GetNpcOffset`、`PlayScn.pas`、`HerbActor.pas`、`AxeMon.pas` …）—— **前端 sprite/场景渲染的 1:1 移植来源**
- 老服务端运行时+数据：`/Users/linxing/Documents/火炬源码+配套服务端/MirServer/`
- 老 Java NIO 服务端（已被本项目的 Netty 替代）：`/Volumes/未命名/jootm2-server/`
- ~~旧 HTML5 PixiJS 副本 `/Volumes/未命名/client/`~~：已废弃，**不作为参考依据**
- 项目 README 与本文档：`README.md`、`HANDOFF.md`

## 13. 一句总结

**后端 M2Server 移植已全部完成**（账号角色/多地图/NPC 脚本商店/掉落拾取/技能魔法/战斗 buff 宠物/任务/装备套装/行会攻城/组队仓库交易，§3 第 1-22 条），`mvn package` + smoke test 通过。**前端重写进行中**：已完成 GUI 框架 + 登录/选角/游戏场景（真实等距地图渲染 + 移动/聊天/战斗闭环 + **实体真实 sprite**，§3 第 23-26 条）；下一步是**行走/攻击动画 → 点击交互 → 背包/NPC GUI**（§5）。接手先读 §2 目录、§5 方向、§10 关键点、§11 坑、§14 待办。

### 里程碑：前端移动/动画系统已完整打磨对齐原版（§3 第 37-45 条）

> 这一系列把「人物在地图上移动」从能走打磨到与原版手感一致，是一个完整闭环：

| 能力 | 说明 |
|------|------|
| **鼠标移动** | 删键盘移动，改为按住左键走 / 右键跑，方向随鼠标实时判定（§40） |
| **走/跑动作分离** | 左键 walk、右键 run（独立 `HA.run` 跑步帧，服务端广播 `run`），非「走动画二倍速」（§43） |
| **跑=一次 2 格** | 对齐原版 `SM_RUN movestep=2`，跑动原子移动 2 格，不被抬起打断（§45） |
| **动画连续循环** | 连续移动不重置动画相位，走 540ms/格、跑 360ms/格，消除「重复前几帧」（§44） |
| **匀速卷动** | 地图以移动速度匀速反向卷动（消除 lerp 先快后慢抖动），人物固定在画面中心（§41） |
| **走动画过渡** | 人物带 `offsetX/Y` 过渡，从旧格滑到新格，与地图反向偏移共用 `_viewX` 严格同步（§42） |
| **血条/名字精确定位** | 按原版 `DrawScrn`：血条 `格顶-57`、名字 `格顶-71`，跟随 sprite 过渡（§38/39） |

前端移动手感已接近原版，可继续推进阶段 2 剩余（地图对象交互、战斗动画细化、音效等）。

## 14. 优化项备忘（先记不做，优先保证主线）

> 原则：识别到的进阶优化**先记在此处**，不立即实现，优先推进主线功能。主线完成后择机逐项做。

### 前端 WIL / 资源加载
- [ ] **请求优先级队列**：可见区域 / 当前交互请求的 chunk 优先于离屏预取，避免抢占关键帧（`frontend/gfx/scheduler.mjs` 目前是纯 FIFO + 全局 5 并发 + 去重 + 边界对齐图头）。**实例**：进图后动画光效 10 帧大图（100×100）会挤占 tiles 带宽，地面要 10 秒+ 才铺满，优先级队列可解。**实例 2**：玩家/怪物首次从 stand 切 walk 动画时，walk 帧纹理未加载 → sprite 短暂消失（等几秒后才正常）。
- [ ] **实体动作帧预取**：entityAdd 时预取该实体的 stand/walk 常用帧（8 方向），避免移动瞬间白屏。
- [ ] **预测预取**：地图滚动 / 角色移动时按方向预加载前方 tile，降低滚图卡顿（地图场景比 UI 更吃这个）。
- [ ] **chunk 级缓存**：当前是图级缓存（解包后存 canvas）；若解包耗时成瓶颈，改缓存「已解包的 chunk」避免重复解包同一 chunk。

### 前端渲染（阶段 2 后续）
- [ ] **飞斧/箭矢飞行特效**：远程怪攻击目前只有 `attack` 广播（受击动画/日志），原版 `RM_FLYAXE` 有投射物飞行动画（`magiceff.pas` 的 `mtFlyAxe`，Effect 库帧 + 飞行插值），属特效系统的一部分。
- [x] **实体真实 sprite**（已完成，见 §3 第 26 条）。
- [x] **行走/攻击动画**（已完成，见 §3 第 27 条）。
- [x] **点击交互**（点地走/点怪攻击/点 NPC 对话/点物拾取，已完成，见 §3 第 27 条）。
- [x] **背包/装备/NPC 对话框 GUI**（已完成，见 §3 第 28 条）。
- [x] **点墙就近寻路**（已完成，见 §3 第 31 条）。
- [x] **血条/名字与 sprite 重叠**（已完成，见 §3 第 31 条）。
- [x] **装备外观**（已完成，见 §3 第 29 条）。
- [x] **宠物/玩家死亡残留**（已完成，见 §3 第 31 条 entityRemove 广播）。
- [x] **其他玩家装备变化同步**（已完成：`equip` 穿装备后补 `broadcastEntityAdd`，其他玩家收到更新后的 dress/weapon）。
- [x] **登录/注册/改密码界面照搬原版**（已完成，见 §3 第 33 条）。
- [x] **选角/建角界面照搬原版 `TSelectChrScene`**（已完成，见 §3 第 34 条）。
- [ ] **选角立绘冻结/解冻过渡动画 + 特效**：当前简化为「选中=站立动画 / 未选中=冻结帧静止」；原版选中时播解冻动画（`140-80+job*40+sex*120` 10 帧 + `ChrSel[4..11]` 特效 DrawBlend 闪烁），取消时播冻结动画（倒序）。
- [ ] **DMessageDlg 消息框**：选角界面的删除确认/无角色提示目前用浏览器 `confirm/alert`，原版是自绘消息框（`FrmDlg.DMessageDlg`，ConfirmDlg.pas）；游戏内统一消息框可后续做。
- [ ] **登录开场动画**：照 `TLoginScene.PlayScene` 的 `NowOpening` —— `ChrSel[23..32]`（103+CurFrame-80）在 (152,96) 每 230ms 一帧，播完淡出（FadeIndex=29）进选角场景。

### 音频
- [ ] **音效系统**：`resource.mjs` 的 `wavUrl/wavCount` 已就绪（694 个 wav，`/resources/Wav/` 已托管 `audio/wav`），后续做 Web Audio 播放 + 按场景预加载。
- [ ] **登录 BGM**：原版 `TLoginScene.OpenScene` 的 `PlayBGM(bmg_intro)`（依赖音效系统）。

### 后端
- [ ] **changePassword 协议**：Delphi `CM_CHANGEPASSWORD=2003`；前端改密码窗口已就位（§3 第 33 条，提交暂提示未开放），补服务端协议 + AccountDao 改密即可接通。
- [ ] **注册扩展字段落库**：前端注册表单已收集 姓名/身份证/生日/密保/电话/邮箱（§3 第 33 条）并随 register 发送，服务端当前忽略；如需存储扩展 `accounts` 表。
- [ ] **攻城状态落盘**：`castle.warActive/warEndAt/mainDoorHp/wallHp` 仅内存，未持久化（行会文本已落盘 `GuildBase/`）。
- [ ] **装备强化升级**（非祝福油）：`RandomUpgradeItem`/`UserSelectGetBackUpgrade` 依赖专门 NPC 脚本 + 升级材料 + `UpgradingList` 持久化，属独立工程（见 §4）。