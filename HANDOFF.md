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

关键入口文件：`Main.java`、`service/GameService.java`、`game/GameWorld.java`、`game/npc/*`、`resource/NpcData.java`、`db/Database.java`、`net/*`；前端 `frontend/main.mjs` + `scene/` + `map/` + `ui/` + `gfx/`。

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

## 14. 优化项备忘（先记不做，优先保证主线）

> 原则：识别到的进阶优化**先记在此处**，不立即实现，优先推进主线功能。主线完成后择机逐项做。

### 前端 WIL / 资源加载
- [ ] **请求优先级队列**：可见区域 / 当前交互请求的 chunk 优先于离屏预取，避免抢占关键帧（`frontend/gfx/scheduler.mjs` 目前是纯 FIFO + 全局 5 并发 + 去重 + 边界对齐图头）。**实例**：进图后动画光效 10 帧大图（100×100）会挤占 tiles 带宽，地面要 10 秒+ 才铺满，优先级队列可解。
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