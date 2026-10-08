# jootm2

传奇（Legend of Mir 2 风格）游戏的集成版：**Java 11 + Netty + SQLite**，单端口同时提供：

| 地址 | 说明 |
|------|------|
| http://localhost:8080/ | 前端（原生 canvas 2d 客户端） |
| http://localhost:8080/ws | WebSocket 游戏协议 |
| http://localhost:8080/api/status | 服务器状态 |
| http://localhost:8080/api/players | 在线玩家 |
| http://localhost:8080/api/broadcast | 全服广播 (POST JSON) |
| http://localhost:8080/resources/resources.json | 传奇资源索引 |

一个 Netty backend 同时承载前端静态文件、REST API、WebSocket 游戏协议和传奇资源文件（带 CORS）。

## 目录结构（前后端分离）

```
jootm2/
├── src/main/java/com/jootm2/server/   # 后端（Netty + 游戏逻辑 + SQLite）
│   ├── Main.java                      # 入口
│   ├── config/ db/ game/ service/     # 从旧 NIO 版沿用，未改动
│   └── net/                           # 新的 Netty 网络层
│       ├── NettyServer.java
│       ├── HttpServerHandler.java      # 静态文件 + REST API 路由
│       └── ws/WebSocketFrameHandler.java  # WebSocket 帧 <-> GameService
├── frontend/                          # 前端（原生 canvas 2d，ES Module）
│   ├── index.html
│   ├── main.mjs                       # 入口（loadResources → WS → LoginScene → 主循环）
│   └── scene/ actor/ map/ gfx/ net/ gui/ ui/ core/ util/ image/
├── resources/                         # 客户端渲染资源（Data/Map/Wav/resources.json）——Docker 挂载
├── gamedata/                          # 服务端游戏数据（mud2 数据库 + Mir200/Envir 脚本）
│   ├── mud2/DB/                       # 游戏模板数据（CSV，可直接编辑）：StdItems/Magic/Monster.csv
│   └── Mir200/Envir/                  # MapInfo/MonGen/NPC脚本/商店/爆率等
├── config/server.properties           # 运行配置
├── scripts/smoke_test.py              # 端到端集成测试
├── Dockerfile
└── docker-compose.yml
```

## 环境要求

- JDK 11+
- Maven 3.6+

## 构建与运行

```bash
mvn -q -DskipTests package
java -jar target/jootm2.jar
```

启动后访问 http://localhost:8080/ 即可注册 → 登录 → 建角色 → 进入游戏。

> 建议在项目根目录运行。若从其他目录（如 `target/`）运行，程序会自动向上定位到项目根目录下的 `frontend`/`resources`/`gamedata`，无需手动指定。`config/server.properties` 缺失时回退到内置默认值（8080 端口等），不会报错。

### 传奇资源

`resources/` 需要包含 `Data/`、`Map/`、`Wav/` 和 `resources.json`（旧引擎的 WIL/WIX 图片库与 .map 地图）。本地开发可直接软链：

```bash
ln -s "/Users/linxing/Desktop/Legend of Mir" resources
```

### 游戏模板数据（CSV）

`gamedata/mud2/DB/` 下是游戏模板数据（物品/怪物/技能），已从 Delphi Paradox `.DB` 二进制转为 **UTF-8 CSV**，可直接用 Excel / 文本编辑器修改：

| 文件 | 内容 |
|------|------|
| StdItems.csv | 物品模板（24 列：Idx, Name, StdMode, Shape, Weight, AniCount, …） |
| Monster.csv | 怪物模板（22 列：Name, Race, RaceImg, Appr, Level, …） |
| Magic.csv | 技能模板（19 列：MagId, MagName, EffectType, Effect, …） |

- 首行是表头（字段名），服务端读取时跳过；字段顺序与旧 Delphi `LocalDB.pas` 一致。
- 模板只在**首次启动**时导入 SQLite，之后从 SQLite 读取（不常驻内存）。
- 修改 CSV 后需**删除 `data/jootm2.db` 重启**才会重新导入。

## Docker 运行

```bash
# 1. 准备好 ./resources（Data/Map/Wav/resources.json）与 ./data 目录
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
| world.width / world.height | 200 / 200 | 地图尺寸 |
| world.playerSpawnX / Y | 100 / 100 | 出生点 |

## 协议

客户端与服务端通过 WebSocket 发送 JSON 文本帧（详见 `HANDOFF.md` §7）：

- 客户端 → 服务端：`login` / `register` / `listCharacters` / `createCharacter` / `deleteCharacter` / `enterGame` / `noticeOk` / `move` / `say` / `attack` / `castMagic` / `magicKeyChange` / `npcTalk` / `npcSelect` / `buyItem` / `sellItem` / `pickup` / `useItem` / `drop` / `moveItem` / `storageOpen` / `storageStore` / `storageTake` / `tradeRequest` / `tradeAccept` / `tradeAddItem` / `tradeAddGold` / `tradeConfirm` / `tradeCancel` / `logout` / `ping`
- 服务端 → 客户端：`loginResult` / `registerResult` / `characterList` / `createCharacterResult` / `deleteCharacterResult` / `enterGameResult` / `notice` / `enterGame` / `changeMap` / `entityAdd` / `entityRemove` / `move` / `stats` / `attack` / `spellCast` / `fireWall` / `doorState` / `death` / `chat` / `systemMessage` / `itemDrop` / `itemRemove` / `bagUpdate` / `npcSay` / `npcClose` / `pong`

## 测试

```bash
# 先启动服务端
java -jar target/jootm2.jar
# 另开终端，运行端到端测试（覆盖 注册→登录→建角色→进游戏→移动→聊天→登出→战斗）
python3 scripts/smoke_test.py
```