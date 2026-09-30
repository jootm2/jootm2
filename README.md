# jootm2

传奇（Legend of Mir 2 风格）游戏的集成版：**Java 11 + Netty + SQLite**，单端口同时提供：

| 地址 | 说明 |
|------|------|
| http://localhost:8080/ | 前端（PixiJS 客户端，HTML5） |
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
├── frontend/                          # 前端（PixiJS 客户端静态文件）
│   ├── index.html
│   ├── pixi.mjs / *.mjs
│   └── scene/ actor/ image/ map/
├── resources/                         # 客户端渲染资源（Data/Map/Wav/resources.json）——Docker 挂载
├── gamedata/                          # 服务端游戏数据（mud2 数据库 + Mir200/Envir 脚本）
│   ├── mud2/DB/                       # 只读数据库：StdItems/Magic/Monster.DB
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

> 需在项目根目录运行：`config/server.properties` 里的 `frontend`、`resources`、`data` 都是相对路径。

### 传奇资源

`resources/` 需要包含 `Data/`、`Map/`、`Wav/` 和 `resources.json`（旧引擎的 WIL/WIX 图片库与 .map 地图）。本地开发可直接软链：

```bash
ln -s "/Users/linxing/Desktop/Legend of Mir" resources
```

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

客户端与服务端通过 WebSocket 发送 JSON 文本帧（同旧版 HTML5 客户端协议）：

- 客户端 → 服务端：`login` / `register` / `listCharacters` / `createCharacter` / `deleteCharacter` / `enterGame` / `move` / `say` / `attack` / `logout`
- 服务端 → 客户端：`loginResult` / `registerResult` / `characterList` / `createCharacterResult` / `deleteCharacterResult` / `enterGameResult` / `enterGame` / `entityAdd` / `entityRemove` / `move` / `stats` / `attack` / `death` / `chat` / `systemMessage`

## 测试

```bash
# 先启动服务端
java -jar target/jootm2.jar
# 另开终端，运行端到端测试（覆盖 注册→登录→建角色→进游戏→移动→聊天→登出→战斗）
python3 scripts/smoke_test.py
```