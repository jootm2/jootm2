package com.jootm2.server.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.jootm2.server.config.ServerConfig;
import com.jootm2.server.game.common.Direction;
import com.jootm2.server.game.common.ExperienceTable;
import com.jootm2.server.game.common.ItemInstance;
import com.jootm2.server.game.common.ItemTemplate;
import com.jootm2.server.game.common.MagicTemplate;
import com.jootm2.server.game.common.MonsterTemplate;
import com.jootm2.server.game.npc.Npc;
import com.jootm2.server.game.npc.NpcScript;
import com.jootm2.server.game.npc.NpcScriptEngine;
import com.jootm2.server.resource.MapFileReader;
import com.jootm2.server.resource.NpcData;
import com.jootm2.server.resource.WorldData;

import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

/**
 * In-memory game scene: the map grid, all live actors and the templates loaded
 * from SQLite. All mutation is performed under {@link #lock} by the message
 * handlers and by the single game tick.
 */
public final class GameWorld {

    private static final Charset GBK = Charset.forName("GBK");

    public static final int SIGHT_RANGE = 12;
    public static final int AGGRO_RANGE = 8;
    public static final int MONSTER_COUNT = 30;
    public static final long RESPAWN_MS = 15_000L;
    public static final long REGEN_INTERVAL_MS = 2_000L;
    public static final long POISON_INTERVAL_MS = 1_000L;
    public static final long DOOR_OPEN_MS = 5_000L;
    /** 地面掉落物存活时长（原版 MapItem.DisappearTime：约 60 秒后自动消失）。 */
    public static final long GROUND_ITEM_TTL_MS = 60_000L;

    /** 远程怪物 Race（照 ObjAxeMon/ObjMon/ObjMon2：喷毒蜘蛛82/双斧骷髅87/暗黑战士93/闪电僵尸94/弓箭手104/弓箭守卫112/弓箭警察20）。 */
    private static final Set<Integer> RANGED_RACES = Set.of(82, 87, 93, 94, 104, 112, 20);
    /** 守卫 Race（照 ObjMon2.pas TGuardUnit/TArcherGuard：弓箭守卫112/弓箭警察20）——不主动攻击白名玩家。 */
    private static final Set<Integer> GUARD_RACES = Set.of(20, 112);
    private static final int RANGED_ATTACK_RANGE = 7;   // 照 TDualAxeMonster.AttackTarget 的 ±7
    private static final int RANGED_KEEP_AWAY = 4;      // 距离≤4 往后逃（保持距离）
    private static final int RANGED_CHASE_RANGE = 11;   // 距离≤11 才追

    public final Object lock = new Object();

    public final Map<Integer, ItemTemplate> itemTemplates = new HashMap<>();
    public final Map<String, MonsterTemplate> monsterTemplates = new HashMap<>();
    public final Map<Integer, MagicTemplate> magicTemplates = new HashMap<>();
    private final Map<String, GameMap> maps = new HashMap<>();
    private final Map<Long, Actor> actors = new HashMap<>();
    private final Map<String, Player> playersByName = new HashMap<>();
    private final AtomicLong idGen = new AtomicLong(1L);
    private final AtomicLong itemIdGen = new AtomicLong(10_000_000L);

    public GameMap defaultMap;
    public int startX;
    public int startY;
    private final Path mapDir;
    private final Path envDir;

    private final Map<String, List<WorldData.Gate>> gatesBySrc = new HashMap<>();
    private final Set<String> availableMaps = new HashSet<>();
    private List<WorldData.MonGenEntry> monGenEntries = new ArrayList<>();
    private final Map<Long, Npc> npcs = new HashMap<>();
    private final Map<String, List<Npc>> npcsByMap = new HashMap<>();
    private final Map<String, List<WorldData.DropEntry>> dropTables = new HashMap<>();
    private final Map<Long, GroundItem> groundItems = new HashMap<>();
    private List<WorldData.MapQuestEntry> mapQuests = new ArrayList<>();
    private final Map<String, NpcScript> questScripts = new HashMap<>();
    private final NpcScriptEngine npcEngine = new NpcScriptEngine(this);
    private final List<FireWall> fireWalls = new ArrayList<>();
    private final Map<String, Guild> guilds = new HashMap<>();
    private final Map<String, String> guildOfPlayer = new HashMap<>();
    private final Map<Long, Party> partyOf = new HashMap<>();
    private Castle castle;

    /** 登录公告（选角后 notice 界面显示的内容，来自 Mir200/Notice/Notice.txt）。 */
    private final List<String> noticeLines = new ArrayList<>();

    private long lastRegenAt = System.currentTimeMillis();

    public GameWorld(ServerConfig config,
                     Map<Integer, ItemTemplate> itemTemplates,
                     Map<String, MonsterTemplate> monsterTemplates,
                     Map<Integer, MagicTemplate> magicTemplates) {
        this.itemTemplates.putAll(itemTemplates);
        this.monsterTemplates.putAll(monsterTemplates);
        this.magicTemplates.putAll(magicTemplates);

        Path root = Paths.get(config.gamedataRoot()).toAbsolutePath();
        this.mapDir = root.resolve("Mir200").resolve("Map");
        this.envDir = root.resolve("Mir200").resolve("Envir");
        loadNotice(root.resolve("Mir200").resolve("Notice").resolve("Notice.txt"));

        WorldData.StartPoint sp = WorldData.loadStartPoint(envDir.resolve("StartPoint.txt"));
        this.startX = sp.x;
        this.startY = sp.y;
        this.defaultMap = MapFileReader.read(sp.mapId, mapDir);
        this.maps.put(defaultMap.name, defaultMap);

        scanAvailableMaps();
        loadMapInfo();
        this.monGenEntries = WorldData.loadMonGen(envDir.resolve("MonGen.txt"));
        loadNpcs();
        loadMapQuests();
        this.castle = WorldData.loadCastle(envDir.resolve("Castle").resolve("Sabuk.txt"));
        loadGuilds();
        loadDropTables();
        spawnMonsters(defaultMap);
        attachNpcs(defaultMap);
        System.out.println("[world] castle=" + castle.name + " map=" + castle.mapId
                + " doorHP=" + castle.mainDoorMaxHp + " ownGuild=" + (castle.ownGuild.isEmpty() ? "(无主)" : castle.ownGuild));
    }

    private void loadMapQuests() {
        mapQuests = WorldData.loadMapQuest(envDir.resolve("MapQuest.txt"));
        Path questDir = envDir.resolve("MapQuest_Def");
        for (WorldData.MapQuestEntry e : mapQuests) {
            if (questScripts.containsKey(e.qfile)) {
                continue;
            }
            NpcScript s = NpcData.loadScript(questDir, e.qfile, "");
            questScripts.put(e.qfile, s);
        }
        System.out.println("[world] loaded " + mapQuests.size() + " map quests, "
                + questScripts.size() + " quest scripts");
    }

    // -- guilds / castle siege ------------------------------------------------

    public Castle castle() {
        return castle;
    }

    public Collection<Guild> guilds() {
        return guilds.values();
    }

    // -- parties (组队) ---------------------------------------------------------

    public Party partyOf(long playerId) {
        return partyOf.get(playerId);
    }

    /** 创建队伍（队长 + 首名成员）。 */
    public Party createParty(long leaderId, long memberId) {
        Party p = new Party(leaderId);
        p.memberIds.add(memberId);
        partyOf.put(leaderId, p);
        partyOf.put(memberId, p);
        return p;
    }

    /** 加入已有队伍。 */
    public boolean joinParty(long playerId, long leaderId) {
        if (partyOf.containsKey(playerId)) {
            return false;
        }
        Party p = partyOf.get(leaderId);
        if (p == null) {
            return false;
        }
        p.memberIds.add(playerId);
        partyOf.put(playerId, p);
        return true;
    }

    /** 退队；人数不足则解散。 */
    public boolean leaveParty(long playerId) {
        Party p = partyOf.remove(playerId);
        if (p == null) {
            return false;
        }
        p.memberIds.remove(playerId);
        if (p.size() <= 1) {
            for (long id : new ArrayList<>(p.memberIds)) {
                partyOf.remove(id);
            }
        }
        return true;
    }

    /** 创建行会（创建者成为会长）。 */
    public Guild createGuild(String name, String master) {
        if (name == null || name.isBlank() || guilds.containsKey(name)) {
            return null;
        }
        if (guildOfPlayer.containsKey(master)) {
            return null;   // 创建者已在行会
        }
        Guild g = new Guild(name, master);
        guilds.put(name, g);
        guildOfPlayer.put(master, name);
        saveGuild(g);
        return g;
    }

    public Guild guildByName(String name) {
        return guilds.get(name);
    }

    public Guild guildOf(String playerName) {
        String gname = guildOfPlayer.get(playerName);
        return gname == null ? null : guilds.get(gname);
    }

    public boolean joinGuild(String playerName, String guildName) {
        if (guildOfPlayer.containsKey(playerName)) {
            return false;
        }
        Guild g = guilds.get(guildName);
        if (g == null || !g.addMember(playerName)) {
            return false;
        }
        guildOfPlayer.put(playerName, guildName);
        saveGuild(g);
        return true;
    }

    /** 退会；会长退会则解散行会。 */
    public boolean leaveGuild(String playerName) {
        String gname = guildOfPlayer.remove(playerName);
        if (gname == null) {
            return false;
        }
        Guild g = guilds.get(gname);
        if (g != null) {
            g.removeMember(playerName);
            if (g.masterName.equals(playerName)) {
                guilds.remove(gname);
                deleteGuildFile(gname);
            } else {
                saveGuild(g);
            }
        }
        return true;
    }

    /** 行会 A 对行会 B 宣战（互相加入敌对列表）。 */
    public boolean declareGuildWar(String aName, String bName) {
        Guild a = guilds.get(aName);
        Guild b = guilds.get(bName);
        if (a == null || b == null) {
            return false;
        }
        if (!a.warGuilds.contains(bName)) {
            a.warGuilds.add(bName);
            b.warGuilds.add(aName);
            saveGuild(a);
            saveGuild(b);
        }
        return true;
    }

    /** 行会 A 与行会 B 结盟（移除敌对并互相加入同盟列表）。 */
    public boolean makeGuildAlly(String aName, String bName) {
        Guild a = guilds.get(aName);
        Guild b = guilds.get(bName);
        if (a == null || b == null) {
            return false;
        }
        a.warGuilds.remove(bName);
        b.warGuilds.remove(aName);
        if (!a.allyGuilds.contains(bName)) {
            a.allyGuilds.add(bName);
            b.allyGuilds.add(aName);
            saveGuild(a);
            saveGuild(b);
        }
        return true;
    }

    // -- notice ----------------------------------------------------------------

    /** 加载登录公告（Notice.txt，GBK），过滤空行与纯空白行。 */
    private void loadNotice(Path file) {
        noticeLines.clear();
        try {
            if (!Files.exists(file)) {
                return;
            }
            for (String line : Files.readAllLines(file, GBK)) {
                String t = line.trim();
                if (!t.isEmpty()) {
                    noticeLines.add(t);
                }
            }
        } catch (IOException e) {
            System.err.println("[world] cannot load Notice.txt (" + e.getMessage() + ")");
        }
    }

    public List<String> noticeLines() {
        return noticeLines;
    }

    // -- guild persistence ------------------------------------------------------

    private Path guildDir() {
        return envDir.resolve("GuildBase");
    }

    /** 启动时加载 GuildBase 下所有行会文件。 */
    private void loadGuilds() {
        Path dir = guildDir();
        if (!Files.isDirectory(dir)) {
            return;
        }
        int loaded = 0;
        try (DirectoryStream<Path> ds = Files.newDirectoryStream(dir, "*.txt")) {
            for (Path p : ds) {
                Guild g = loadGuildFile(p);
                if (g != null) {
                    guilds.put(g.name, g);
                    for (String m : g.members) {
                        guildOfPlayer.put(m, g.name);
                    }
                    loaded++;
                }
            }
        } catch (IOException e) {
            System.err.println("[world] cannot list GuildBase (" + e.getMessage() + ")");
        }
        System.out.println("[world] loaded " + loaded + " guilds");
    }

    private Guild loadGuildFile(Path file) {
        try {
            String gname = file.getFileName().toString();
            if (gname.endsWith(".txt")) {
                gname = gname.substring(0, gname.length() - 4);
            }
            Guild g = new Guild(gname, "");
            g.members.clear();
            for (String line : Files.readAllLines(file, GBK)) {
                String t = line.trim();
                if (t.startsWith("+")) {
                    String member = t.substring(1).trim();
                    if (member.isEmpty()) {
                        continue;
                    }
                    if (g.masterName.isEmpty()) {
                        g.masterName = member;
                    }
                    g.members.add(member);
                } else if (t.equals("城主")) {
                    g.ownsCastle = true;
                } else if (t.startsWith("盟友 ")) {
                    g.allyGuilds.add(t.substring(3).trim());
                } else if (t.startsWith("敌对 ")) {
                    g.warGuilds.add(t.substring(3).trim());
                }
            }
            if (g.masterName.isEmpty() && !g.members.isEmpty()) {
                g.masterName = g.members.get(0);
            }
            return g.members.isEmpty() ? null : g;
        } catch (IOException e) {
            return null;
        }
    }

    /** 保存行会到 GuildBase/{name}.txt。 */
    private void saveGuild(Guild g) {
        try {
            Files.createDirectories(guildDir());
            List<String> lines = new ArrayList<>();
            lines.add("行会成员");
            lines.add("#0 会长");
            lines.add("+" + g.masterName);
            lines.add("#99 成员");
            for (String m : g.members) {
                if (!m.equals(g.masterName)) {
                    lines.add("+" + m);
                }
            }
            if (g.ownsCastle) {
                lines.add("城主");
            }
            for (String a : g.allyGuilds) {
                lines.add("盟友 " + a);
            }
            for (String w : g.warGuilds) {
                lines.add("敌对 " + w);
            }
            Files.write(guildDir().resolve(g.name + ".txt"), lines, GBK);
        } catch (IOException e) {
            System.err.println("[world] cannot save guild " + g.name + " (" + e.getMessage() + ")");
        }
    }

    private void deleteGuildFile(String gname) {
        try {
            Files.deleteIfExists(guildDir().resolve(gname + ".txt"));
        } catch (IOException ignored) {
        }
    }

    /** 申请攻城（攻城期间城门/城墙可被攻击）。 */
    public boolean declareSiege(String guildName, int durationSec) {
        if (castle.warActive || guilds.get(guildName) == null) {
            return false;
        }
        castle.warActive = true;
        castle.warEndAt = System.currentTimeMillis() + durationSec * 1000L;
        castle.warGuild = guildName;
        broadcastAll(castleMsg("行会 " + guildName + " 开始攻打 " + castle.name + "！"));
        return true;
    }

    /** 攻击城门，返回伤害（攻城期间、靠近城门才有效）。 */
    public int attackCastleDoor(Player p, int damage) {
        if (!castle.warActive || !castle.mapId.equals(p.map.name)) {
            return 0;
        }
        int dx = Math.abs(p.x - castle.mainDoorX);
        int dy = Math.abs(p.y - castle.mainDoorY);
        if (dx > 1 || dy > 1 || castle.doorBroken()) {
            return 0;
        }
        castle.mainDoorHp = Math.max(0, castle.mainDoorHp - damage);
        if (castle.doorBroken()) {
            castle.mainDoorOpen = true;
            broadcastAll(castleMsg(castle.name + " 的城门已被攻破！"));
        }
        return damage;
    }

    /** 攻城结束判定：城门+城墙全破则攻城行会占领。 */
    private void tickSiege(long now) {
        if (!castle.warActive || now < castle.warEndAt) {
            return;
        }
        castle.warActive = false;
        if (castle.doorBroken() && castle.wallsBroken()) {
            castle.ownGuild = castle.warGuild;
            Guild g = guilds.get(castle.warGuild);
            if (g != null) {
                g.ownsCastle = true;
            }
            broadcastAll(castleMsg("攻城战结束，行会 " + castle.warGuild + " 占领了 " + castle.name + "！"));
        } else {
            broadcastAll(castleMsg("攻城战结束，守城成功。"));
        }
        castle.warGuild = "";
    }

    private JsonObject castleMsg(String text) {
        JsonObject o = new JsonObject();
        o.addProperty("type", "systemMessage");
        o.addProperty("text", text);
        return o;
    }

    private void loadDropTables() {
        Path dir = envDir.resolve("MonItems");
        if (!Files.isDirectory(dir)) {
            return;
        }
        try (DirectoryStream<Path> ds = Files.newDirectoryStream(dir)) {
            for (Path p : ds) {
                String fn = p.getFileName().toString();
                if (!fn.toLowerCase().endsWith(".txt")) {
                    continue;
                }
                String monName = fn.substring(0, fn.length() - 4);
                List<WorldData.DropEntry> list = WorldData.loadMonItems(p);
                if (!list.isEmpty()) {
                    dropTables.put(monName, list);
                }
            }
        } catch (IOException e) {
            System.err.println("[world] cannot list MonItems (" + e.getMessage() + ")");
        }
        System.out.println("[world] loaded " + dropTables.size() + " monster drop tables");
    }

    private void loadNpcs() {
        Path env = envDir;
        List<NpcData.Spawn> spawns = NpcData.loadNpcs(env.resolve("Npcs.txt"));
        spawns.addAll(NpcData.loadMerchants(env.resolve("MerChant.txt")));
        int loaded = 0;
        for (NpcData.Spawn s : spawns) {
            Npc npc = new Npc(newId(), s.name);
            npc.scriptName = s.scriptName;
            npc.npcKind = s.kind;
            npc.npcFace = s.face;
            npc.appr = s.appearance;
            npc.x = s.x;
            npc.y = s.y;
            npc.merchant = s.merchant;
            Path scriptDir = env.resolve(s.merchant ? "Market_Def" : "Npc_Def");
            npc.script = NpcData.loadScript(scriptDir, s.scriptName, s.mapId);
            npcs.put(npc.id, npc);
            npcsByMap.computeIfAbsent(s.mapId, k -> new ArrayList<>()).add(npc);
            loaded++;
        }
        System.out.println("[world] loaded " + loaded + " npcs");
    }

    private void attachNpcs(GameMap map) {
        List<Npc> list = npcsByMap.get(map.name);
        if (list == null) {
            return;
        }
        for (Npc npc : list) {
            if (npc.map != null) {
                continue;
            }
            npc.map = map;
            map.add(npc);
            actors.put(npc.id, npc);
        }
    }

    private void scanAvailableMaps() {
        if (!Files.isDirectory(mapDir)) {
            return;
        }
        try (DirectoryStream<Path> ds = Files.newDirectoryStream(mapDir)) {
            for (Path p : ds) {
                String fn = p.getFileName().toString();
                if (fn.toLowerCase().endsWith(".map")) {
                    availableMaps.add(fn.substring(0, fn.length() - 4));
                }
            }
        } catch (IOException e) {
            System.err.println("[world] cannot list maps (" + e.getMessage() + ")");
        }
    }

    private void loadMapInfo() {
        WorldData.MapInfo info = WorldData.loadMapInfo(envDir.resolve("MapInfo.txt"));
        int kept = 0;
        for (WorldData.Gate g : info.gates) {
            if (!availableMaps.contains(g.srcMap) || !availableMaps.contains(g.dstMap)) {
                continue;   // 跳过没有 .map 文件的特殊连接（如 20122）
            }
            gatesBySrc.computeIfAbsent(g.srcMap, k -> new ArrayList<>()).add(g);
            kept++;
        }
        System.out.println("[world] loaded " + info.maps.size() + " map defs, " + kept + " gates");
    }

    public long newId() {
        return idGen.getAndIncrement();
    }

    public int nextItemMakeIndex() {
        return (int) itemIdGen.getAndIncrement();
    }

    // -- item helpers (used by NPC shop / scripts) --------------------------

    public ItemTemplate itemTemplateByName(String name) {
        if (name == null) {
            return null;
        }
        for (ItemTemplate t : itemTemplates.values()) {
            if (name.equals(t.name)) {
                return t;
            }
        }
        return null;
    }

    /** Counts how many of the named item the player holds (bag + equipment). */
    public int countItem(Player p, String name) {
        if ("金币".equals(name)) {
            return (int) Math.min(p.gold, Integer.MAX_VALUE);
        }
        int n = 0;
        for (ItemInstance it : p.bag) {
            ItemTemplate t = itemTemplates.get(it.index);
            if (t != null && name.equals(t.name)) {
                n++;
            }
        }
        for (ItemInstance it : p.equipment) {
            if (it != null) {
                ItemTemplate t = itemTemplates.get(it.index);
                if (t != null && name.equals(t.name)) {
                    n++;
                }
            }
        }
        return n;
    }

    /** Removes up to {@code count} of the named item; returns how many removed. */
    public int takeItems(Player p, String name, int count) {
        if ("金币".equals(name)) {
            int taken = (int) Math.min(p.gold, (long) count);
            p.gold -= taken;
            return taken;
        }
        int remaining = count;
        Iterator<ItemInstance> it = p.bag.iterator();
        while (it.hasNext() && remaining > 0) {
            ItemInstance item = it.next();
            ItemTemplate t = itemTemplates.get(item.index);
            if (t != null && name.equals(t.name)) {
                it.remove();
                remaining--;
            }
        }
        return count - remaining;
    }

    /** Adds {@code count} copies of the named item (or gold) to the player. */
    public void giveItem(Player p, String name, int count) {
        if ("金币".equals(name)) {
            p.gold += count;
            return;
        }
        ItemTemplate t = itemTemplateByName(name);
        if (t == null) {
            return;
        }
        for (int i = 0; i < count; i++) {
            p.bag.add(new ItemInstance(nextItemMakeIndex(), t.index, t.duraMax, t.duraMax));
        }
    }

    // -- scene access -------------------------------------------------------

    public Player player(String name) {
        return playersByName.get(name);
    }

    public GameMap map(String name) {
        return maps.get(name);
    }

    /**
     * Lazily loads a map by id (reads its {@code .map} and spawns its monsters).
     * Returns {@code null} when the id has no backing map file.
     */
    public GameMap getOrLoadMap(String name) {
        if (name == null || name.isEmpty()) {
            return defaultMap;
        }
        GameMap m = maps.get(name);
        if (m != null) {
            return m;
        }
        if (!availableMaps.contains(name)) {
            return null;
        }
        m = MapFileReader.read(name, mapDir);
        maps.put(name, m);
        spawnMonsters(m);
        attachNpcs(m);
        return m;
    }

    /** Returns the gate whose source tile is {@code (x,y)} on {@code mapId}, if any. */
    public WorldData.Gate gateAt(String mapId, int x, int y) {
        List<WorldData.Gate> list = gatesBySrc.get(mapId);
        if (list == null) {
            return null;
        }
        for (WorldData.Gate g : list) {
            if (g.srcX == x && g.srcY == y) {
                return g;
            }
        }
        return null;
    }

    /**
     * Moves a player to a destination tile on another (or the same) map.
     * Returns the new map, or {@code null} if the destination is unavailable.
     */
    public GameMap changeMap(Player p, String dstMapId, int x, int y) {
        GameMap target = getOrLoadMap(dstMapId);
        if (target == null) {
            return null;
        }
        if (p.map != null) {
            p.map.remove(p.id);
        }
        p.map = target;
        p.x = x;
        p.y = y;
        target.add(p);
        return target;
    }

    public Actor actor(long id) {
        return actors.get(id);
    }

    public Npc npc(long id) {
        return npcs.get(id);
    }

    public Collection<Player> players() {
        return playersByName.values();
    }

    public int onlineCount() {
        return playersByName.size();
    }

    public int monsterCount() {
        int n = 0;
        for (Actor a : actors.values()) {
            if (a instanceof Monster) {
                n++;
            }
        }
        return n;
    }

    public List<Actor> nearby(GameMap map, int x, int y, int range) {
        List<Actor> list = new ArrayList<>();
        for (Actor a : actors.values()) {
            if (a.alive && a.map == map
                    && Math.max(Math.abs(a.x - x), Math.abs(a.y - y)) <= range) {
                list.add(a);
            }
        }
        return list;
    }

    // -- spawning -----------------------------------------------------------

    private void spawnMonsters(GameMap map) {
        int spawned = 0;
        for (WorldData.MonGenEntry e : monGenEntries) {
            if (!e.mapId.equals(map.name)) {
                continue;
            }
            MonsterTemplate t = monsterTemplates.get(e.monsterName);
            if (t == null) {
                continue;
            }
            int count = Math.min(Math.max(e.count, 1), 3);
            for (int i = 0; i < count; i++) {
                int[] pos = freeNear(map, e.x, e.y, e.range);
                if (pos == null) {
                    continue;
                }
                Monster m = new Monster(newId(), t, pos[0], pos[1]);
                m.map = map;
                m.spawnMap = map;
                m.respawnIntervalMs = e.intervalMin > 0 ? e.intervalMin * 60_000L : 0;
                addActor(m);
                spawned++;
            }
        }
        if (spawned > 0) {
            System.out.println("[world] map=" + map.name + " " + map.width + "x" + map.height
                    + ", spawned monsters=" + spawned);
        }
    }

    private int[] freeNear(GameMap map, int cx, int cy, int range) {
        for (int attempt = 0; attempt < 50; attempt++) {
            int x = cx;
            int y = cy;
            if (range > 0) {
                x += (int) (Math.random() * (range * 2 + 1)) - range;
                y += (int) (Math.random() * (range * 2 + 1)) - range;
            }
            if (map.canWalk(x, y) && !map.isOccupied(x, y)) {
                return new int[]{x, y};
            }
        }
        return map.canWalk(cx, cy) ? new int[]{cx, cy} : null;
    }

    // -- actor lifecycle ----------------------------------------------------

    void addActor(Actor a) {
        actors.put(a.id, a);
        if (a.map == null) {
            a.map = defaultMap;
        }
        a.map.add(a);
    }

    void removeActor(long id) {
        Actor a = actors.remove(id);
        if (a != null && a.map != null) {
            a.map.remove(id);
            JsonObject o = new JsonObject();
            o.addProperty("type", "entityRemove");
            o.addProperty("id", id);
            broadcastAround(a.map, o, a.x, a.y, SIGHT_RANGE);
        }
    }

    /** Registers a player into the scene (its {@code map} must already be set). */
    public void addPlayer(Player p) {
        if (p.map == null) {
            p.map = defaultMap;
        }
        addActor(p);
        playersByName.put(p.name, p);
    }

    /** Removes a player from the scene (logout/disconnect). */
    public void removePlayer(Player p) {
        playersByName.remove(p.name);
        removeActor(p.id);
    }

    /** 创建一个召唤物（宠物）怪物，跟随 owner 并协助其攻击。 */
    public Monster spawnSummon(Player owner, String monsterName) {
        MonsterTemplate t = monsterTemplates.get(monsterName);
        if (t == null) {
            return null;
        }
        int[] pos = freeNear(owner.map, owner.x, owner.y, 2);
        if (pos == null) {
            return null;
        }
        Monster m = new Monster(newId(), t, pos[0], pos[1]);
        m.map = owner.map;
        m.masterId = owner.id;
        addActor(m);
        broadcastEntityAdd(m);
        return m;
    }

    /** 移除召唤物（宠物）：不重生、不掉落。 */
    public void removeSummon(Monster m) {
        m.alive = false;
        m.pendingRespawn = false;
        removeActor(m.id);
        JsonObject death = new JsonObject();
        death.addProperty("type", "death");
        death.addProperty("id", m.id);
        broadcastAround(m.map, death, m.x, m.y, SIGHT_RANGE);
    }

    /** Attempts a single-tile move in the given direction. */
    public boolean tryMove(Actor a, int dir) {
        int nx = a.x + Direction.dx(dir);
        int ny = a.y + Direction.dy(dir);
        a.dir = dir;
        if (!a.map.inside(nx, ny)) {
            return false;
        }
        // 门：关闭时由玩家自动推开
        if (a.map.isDoor(nx, ny) && !a.map.isDoorOpen(nx, ny)) {
            if (!(a instanceof Player)) {
                return false;
            }
            a.map.openDoor(nx, ny, System.currentTimeMillis());
            broadcastDoor(a.map, nx, ny, true);
        }
        if (!a.map.canWalk(nx, ny)) {
            return false;
        }
        if (nx == a.x && ny == a.y) {
            return true;   // turn in place
        }
        if (a.map.isOccupied(nx, ny)) {
            return false;
        }
        a.x = nx;
        a.y = ny;
        return true;
    }

    // -- broadcasting -------------------------------------------------------

    public void broadcastAll(JsonObject msg) {
        String json = msg.toString();
        for (Player p : playersByName.values()) {
            if (p.session != null) {
                p.session.sendText(json);
            }
        }
    }

    public void broadcastAround(GameMap map, JsonObject msg, int x, int y, int range) {
        String json = msg.toString();
        for (Actor a : actors.values()) {
            if (!(a instanceof Player)) {
                continue;
            }
            Player p = (Player) a;
            if (p.session != null && p.map == map
                    && Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) <= range) {
                p.session.sendText(json);
            }
        }
    }

    // ---- game tick ---------------------------------------------------------

    /** Advances the world by one frame. Called from the single game thread. */
    public void tick(long now) {
        List<Actor> snapshot = new ArrayList<>(actors.values());
        for (Actor a : snapshot) {
            if (a instanceof Player) {
                Player pl = (Player) a;
                regen(pl, now);
                // 增益 buff 过期：清字段并重算
                if (pl.acBuffUntil > 0 && pl.acBuffUntil <= now) {
                    pl.acBuffUntil = 0;
                    pl.acBuffBonus = 0;
                    pl.macBuffBonus = 0;
                    pl.recompute(this);
                    sendStats(pl, null);
                }
                if (pl.shieldUntil > 0 && pl.shieldUntil <= now) {
                    pl.shieldUntil = 0;
                    sendStats(pl, null);
                }
            } else if (a instanceof Monster) {
                monsterAi((Monster) a, now);
            }
            applyPoison(a, now);
        }
        closeTimedOutDoors(now);
        tickFireWalls(now);
        tickGroundItems(now);
        tickSiege(now);
        respawnDead(now);
    }

    /** 清理超时地面掉落物并广播移除（原版 MapItem 定时消失）。 */
    private void tickGroundItems(long now) {
        Iterator<GroundItem> it = groundItems.values().iterator();
        while (it.hasNext()) {
            GroundItem gi = it.next();
            if (now - gi.createdAt >= GROUND_ITEM_TTL_MS) {
                it.remove();
                broadcastItemRemove(gi);
            }
        }
    }

    /** 关闭所有打开超时的门并广播。 */
    private void closeTimedOutDoors(long now) {
        for (GameMap map : maps.values()) {
            for (int[] p : map.closeTimedOutDoors(now, DOOR_OPEN_MS)) {
                broadcastDoor(map, p[0], p[1], false);
            }
        }
    }

    /** 广播门状态变化（开/关）。 */
    private void broadcastDoor(GameMap map, int x, int y, boolean open) {
        JsonObject o = new JsonObject();
        o.addProperty("type", "doorState");
        o.addProperty("x", x);
        o.addProperty("y", y);
        o.addProperty("open", open);
        broadcastAround(map, o, x, y, SIGHT_RANGE);
    }

    // -- fire wall (火墙) ----------------------------------------------------

    /** 在目标周围十字 5 格生成火墙，返回生成数量。 */
    public int makeFireWall(Player p, long targetId, int damage, int durationSec) {
        Actor t = actor(targetId);
        int tx = t != null ? t.x : p.x;
        int ty = t != null ? t.y : p.y;
        return makeFireWallAt(p, tx, ty, damage, durationSec);
    }

    public int makeFireWallAt(Player p, int tx, int ty, int damage, int durationSec) {
        long expire = System.currentTimeMillis() + durationSec * 1000L;
        int[][] cells = {{tx, ty - 1}, {tx - 1, ty}, {tx, ty}, {tx + 1, ty}, {tx, ty + 1}};
        int made = 0;
        for (int[] c : cells) {
            if (p.map.inside(c[0], c[1])) {
                fireWalls.add(new FireWall(p.map, c[0], c[1], expire, damage, p.id));
                made++;
            }
        }
        if (made > 0) {
            JsonObject o = new JsonObject();
            o.addProperty("type", "fireWall");
            o.addProperty("x", tx);
            o.addProperty("y", ty);
            o.addProperty("duration", durationSec);
            broadcastAround(p.map, o, tx, ty, SIGHT_RANGE);
        }
        return made;
    }

    /** 火墙每秒对踩上的怪物造成伤害。 */
    private void tickFireWalls(long now) {
        Iterator<FireWall> it = fireWalls.iterator();
        while (it.hasNext()) {
            FireWall f = it.next();
            if (now >= f.expireAt) {
                it.remove();
                continue;
            }
            if (now - f.lastTick < 1000) {
                continue;
            }
            f.lastTick = now;
            for (Actor a : new ArrayList<>(f.map.actors())) {
                if (!(a instanceof Monster) || !a.alive || a.id == f.ownerId) {
                    continue;
                }
                Monster m = (Monster) a;
                if (m.x == f.x && m.y == f.y) {
                    m.hp = Math.max(0, m.hp - f.damage);
                    JsonObject o = new JsonObject();
                    o.addProperty("type", "attack");
                    o.addProperty("attackerId", f.ownerId);
                    o.addProperty("targetId", m.id);
                    o.addProperty("damage", f.damage);
                    o.addProperty("magicId", 22);
                    o.addProperty("x", m.x);
                    o.addProperty("y", m.y);
                    broadcastAround(f.map, o, m.x, m.y, SIGHT_RANGE);
                    sendStats(m, null);
                    if (m.hp <= 0) {
                        Player owner = (Player) actor(f.ownerId);
                        killMonster(m, now, owner);
                        if (owner != null) {
                            grantExpTo(owner, m);
                        }
                    }
                }
            }
        }
    }

    /** 一个火墙单元（地面持续伤害效果）。 */
    private static final class FireWall {
        final GameMap map;
        final int x;
        final int y;
        final long expireAt;
        final int damage;
        final long ownerId;
        long lastTick;

        FireWall(GameMap map, int x, int y, long expireAt, int damage, long ownerId) {
            this.map = map;
            this.x = x;
            this.y = y;
            this.expireAt = expireAt;
            this.damage = damage;
            this.ownerId = ownerId;
        }
    }

    /** 中毒持续伤害：每 POISON_INTERVAL_MS 跳一次。 */
    private void applyPoison(Actor a, long now) {
        if (a.poisonTicks <= 0 || !a.alive) {
            return;
        }
        if (now - a.lastPoisonAt < POISON_INTERVAL_MS) {
            return;
        }
        a.lastPoisonAt = now;
        a.hp = Math.max(0, a.hp - a.poisonDamage);
        a.poisonTicks--;
        sendStats(a, null);
        if (a.hp <= 0) {
            if (a instanceof Monster) {
                killMonster((Monster) a, now, null);
            } else if (a instanceof Player) {
                killPlayer((Player) a);
            }
        }
    }

    private void regen(Player p, long now) {
        if (now - lastRegenAt < REGEN_INTERVAL_MS) {
            return;
        }
        boolean changed = false;
        if (p.hp < p.maxHp) {
            p.hp++;
            changed = true;
        }
        if (p.mp < p.maxMp) {
            p.mp++;
            changed = true;
        }
        if (changed) {
            lastRegenAt = now;
            sendStats(p, null);
        }
    }

    private void monsterAi(Monster m, long now) {
        if (m.pendingRespawn || !m.alive) {
            return;
        }
        if (now < m.paralyzedUntil) {
            return;   // 麻痹定身
        }
        if (m.masterId >= 0) {
            summonAi(m, now);
            return;
        }
        Player target = resolveTarget(m);
        m.targetId = target == null ? -1 : target.id;

        if (target != null) {
            // 远程怪（照 ObjAxeMon TDualAxeMonster）：±7 站定攻击，≤4 后撤保持距离，≤11 才追
            if (m.template != null && RANGED_RACES.contains(m.template.race)) {
                int d = m.distanceTo(target);
                if (d <= RANGED_ATTACK_RANGE) {
                    if (now >= m.nextAttackAt) {
                        m.nextAttackAt = now + m.template.attackSpeed;
                        m.dir = dirTowards(m, target);
                        attackPlayer(m, target);   // 飞斧/吐物伤害同近战公式，attack 广播给前端（飞斧特效待做）
                    }
                    if (d <= RANGED_KEEP_AWAY && now >= m.nextMoveAt && Math.random() < 0.33) {
                        m.nextMoveAt = now + m.template.walkSpeed;
                        int back = (m.dir + 4) % 8;   // 往反方向逃（GetBackPosition）
                        if (tryMove(m, back)) {
                            broadcastMove(m);
                        }
                    }
                } else if (d <= RANGED_CHASE_RANGE && now >= m.nextMoveAt) {
                    m.nextMoveAt = now + m.template.walkSpeed;
                    m.dir = dirTowards(m, target);
                    if (tryMove(m, m.dir)) {
                        broadcastMove(m);
                    }
                }
                return;
            }
            if (m.distanceTo(target) == 1) {
                if (now >= m.nextAttackAt) {
                    m.nextAttackAt = now + m.template.attackSpeed;
                    m.dir = dirTowards(m, target);
                    attackPlayer(m, target);
                }
            } else if (now >= m.nextMoveAt) {
                m.nextMoveAt = now + m.template.walkSpeed;
                m.dir = dirTowards(m, target);
                if (tryMove(m, m.dir)) {
                    broadcastMove(m);
                }
            }
        } else if (now >= m.nextMoveAt) {
            m.nextMoveAt = now + m.template.walkSpeed;
            if (Math.random() < 0.35) {
                m.dir = (int) (Math.random() * 8);
                if (tryMove(m, m.dir)) {
                    broadcastMove(m);
                }
            }
        }
    }

    /** 宠物 AI：跟随主人并协助攻击其附近的怪物。 */
    private void summonAi(Monster m, long now) {
        Player master = (Player) actor(m.masterId);
        if (master == null || !master.alive || master.map != m.map) {
            return;
        }
        Monster enemy = nearestEnemy(master, m);
        if (enemy != null) {
            if (m.distanceTo(enemy) == 1) {
                if (now >= m.nextAttackAt) {
                    m.nextAttackAt = now + m.template.attackSpeed;
                    m.dir = dirTowards(m, enemy);
                    int dmg = Math.max(1, m.rollAttack() - enemy.template.ac);
                    enemy.hp = Math.max(0, enemy.hp - dmg);
                    sendHits(m, enemy, dmg);
                    if (enemy.hp <= 0) {
                        killMonster(enemy, now, master);
                        grantExpTo(master, enemy);
                    }
                }
            } else if (now >= m.nextMoveAt) {
                m.nextMoveAt = now + m.template.walkSpeed;
                m.dir = dirTowards(m, enemy);
                if (tryMove(m, m.dir)) {
                    broadcastMove(m);
                }
            }
        } else if (m.distanceTo(master) > 2 && now >= m.nextMoveAt) {
            m.nextMoveAt = now + m.template.walkSpeed;
            m.dir = dirTowards(m, master);
            if (tryMove(m, m.dir)) {
                broadcastMove(m);
            }
        }
    }

    /** 主人附近可攻击的普通怪物（最近的）。 */
    private Monster nearestEnemy(Player master, Monster self) {
        Monster best = null;
        int bestDist = 6;
        for (Actor a : nearby(master.map, master.x, master.y, 6)) {
            if (a instanceof Monster && a.alive && a.id != self.id && ((Monster) a).masterId < 0) {
                int d = self.distanceTo(a);
                if (d < bestDist) {
                    bestDist = d;
                    best = (Monster) a;
                }
            }
        }
        return best;
    }

    /** 宠物击杀：经验归主人。 */
    private void grantExpTo(Player p, Monster m) {
        p.exp += m.template.exp;
        int oldLevel = p.level;
        int newLevel = ExperienceTable.levelForExp(p.exp);
        if (newLevel > oldLevel) {
            p.level = newLevel;
            p.recompute(this);
            p.hp = p.maxHp;
            p.mp = p.maxMp;
            sendSystem(p, "恭喜！你升到了 " + newLevel + " 级。");
        }
        sendStats(p, null);
    }

    private Player resolveTarget(Monster m) {
        long now = System.currentTimeMillis();
        boolean isGuard = m.template != null && GUARD_RACES.contains(m.template.race);
        Player current = m.targetId >= 0 ? (Player) actor(m.targetId) : null;
        if (current != null && current.alive && current.hideUntil <= now
                && current.map == m.map && current.distanceTo(m) <= AGGRO_RANGE
                && (!isGuard || guardHostile(m, current))) {
            return current;
        }
        Player best = null;
        int bestDist = Integer.MAX_VALUE;
        for (Player p : players()) {
            if (p.map != m.map || p.hideUntil > now) {
                continue;   // 隐身中不成为仇恨目标
            }
            if (isGuard && !guardHostile(m, p)) {
                continue;   // 守卫不打白名玩家（照 TGuardUnit.IsProperTarget：仅反击或打 PK 玩家）
            }
            int d = p.distanceTo(m);
            if (p.alive && d <= AGGRO_RANGE && d < bestDist) {
                best = p;
                bestDist = d;
            }
        }
        return best;
    }

    /** 守卫仇恨判定（照 ObjMon2.pas TGuardUnit.IsProperTarget 非城堡分支）：反击打过自己的，或打有 PK 记录的玩家。 */
    private boolean guardHostile(Monster m, Player p) {
        if (p.id == m.lastHiterId) {
            return true;   // 反击
        }
        return p.pkPoint > 0;   // 红名/灰名（PK 记录），白名 pkPoint=0 不打
    }

    private void attackPlayer(Monster m, Player target) {
        int raw = m.rollAttack();
        int dmg = Math.max(1, raw - target.combat.acMax);
        // 魔法盾：减伤 30%
        if (target.shieldUntil > System.currentTimeMillis()) {
            dmg = dmg * 7 / 10;
        }
        // 护身：伤害先由 MP 抵消
        if (target.manaToHealth > 0 && target.mp > 0) {
            int mpCost = Math.min(target.mp, dmg);
            target.mp -= mpCost;
            dmg -= mpCost;
        }
        target.hp = Math.max(0, target.hp - dmg);
        sendHits(m, target, dmg);
        if (target.hp <= 0) {
            killPlayer(target);
        }
    }

    public void killPlayer(Player p) {
        // 复活戒指：免死一次，戒指损毁
        if (p.revivalRing) {
            removeEquippedByShape(p, 114);
            p.recompute(this);
            p.hp = p.maxHp / 2;
            p.mp = p.maxMp;
            JsonObject msg = new JsonObject();
            msg.addProperty("type", "systemMessage");
            msg.addProperty("text", "复活戒指生效，你免于一死！");
            p.session.sendText(msg.toString());
            sendStats(p, null);
            return;
        }

        JsonObject death = new JsonObject();
        death.addProperty("type", "death");
        death.addProperty("id", p.id);
        broadcastAround(p.map, death, p.x, p.y, SIGHT_RANGE);

        p.hp = p.maxHp;
        p.mp = p.maxMp;
        p.dir = Direction.DOWN;

        GameMap home = getOrLoadMap(p.homeMap);
        if (home == null) {
            home = defaultMap;
        }
        boolean mapChanged = p.map != home;
        if (p.map != null && mapChanged) {
            p.map.remove(p.id);
        }
        p.map = home;
        p.x = p.homeX;
        p.y = p.homeY;
        home.add(p);

        JsonObject msg = new JsonObject();
        msg.addProperty("type", "systemMessage");
        msg.addProperty("text", "你被击败了，已在安全区复活。");
        p.session.sendText(msg.toString());

        if (mapChanged) {
            p.session.sendText(mapSnapshot(p, "changeMap").toString());
            broadcastEntityAdd(p);
        } else {
            sendStats(p, null);
            broadcastMove(p);
        }
    }

    /** 移除玩家身上第一件指定 Shape 的装备（复活戒指损毁等）。 */
    private void removeEquippedByShape(Player p, int shape) {
        for (int slot = 0; slot < p.equipment.length; slot++) {
            ItemInstance it = p.equipment[slot];
            if (it == null) {
                continue;
            }
            ItemTemplate t = itemTemplates.get(it.index);
            if (t != null && t.shape == shape) {
                p.equipment[slot] = null;
                break;
            }
        }
    }

    /** Builds the enter/change-map snapshot (map + self + nearby) for a player. */
    public JsonObject mapSnapshot(Player p, String type) {
        JsonObject o = new JsonObject();
        o.addProperty("type", type);
        JsonObject map = new JsonObject();
        map.addProperty("name", p.map.name);
        map.addProperty("width", p.map.width);
        map.addProperty("height", p.map.height);
        o.add("map", map);
        o.add("player", p.toPlayerJson(this));
        JsonArray nearby = new JsonArray();
        p.seen.clear();
        for (Actor a : nearby(p.map, p.x, p.y, SIGHT_RANGE)) {
            if (a.id != p.id) {
                nearby.add(a.toBriefJson());
                p.seen.add(a.id);
            }
        }
        o.add("nearby", nearby);
        JsonArray ground = new JsonArray();
        for (GroundItem gi : groundItems.values()) {
            if (gi.map == p.map
                    && Math.max(Math.abs(gi.x - p.x), Math.abs(gi.y - p.y)) <= SIGHT_RANGE) {
                ItemTemplate t = gi.item != null ? itemTemplates.get(gi.item.index) : null;
                ground.add(gi.toJson(t != null ? t.name : "?", t != null ? t.looks : 0));
            }
        }
        o.add("groundItems", ground);
        return o;
    }

    /** 玩家移动后增量更新视野：广播新进入的实体（entityAdd）与离开的（entityRemove）。 */
    public void updateSight(Player p) {
        Set<Long> nowSeen = new HashSet<>();
        for (Actor a : actors.values()) {
            if (a.alive && a.id != p.id && a.map == p.map
                    && Math.max(Math.abs(a.x - p.x), Math.abs(a.y - p.y)) <= SIGHT_RANGE) {
                nowSeen.add(a.id);
                if (!p.seen.contains(a.id)) {
                    JsonObject o = new JsonObject();
                    o.addProperty("type", "entityAdd");
                    o.add("entity", a.toBriefJson());
                    p.session.sendText(o.toString());
                }
            }
        }
        for (long id : new ArrayList<>(p.seen)) {
            if (!nowSeen.contains(id)) {
                JsonObject o = new JsonObject();
                o.addProperty("type", "entityRemove");
                o.addProperty("id", id);
                p.session.sendText(o.toString());
            }
        }
        p.seen.clear();
        p.seen.addAll(nowSeen);
    }

    /** Marks a monster dead and schedules its respawn (does not remove the Actor). */
    public void killMonster(Monster m, long now, Player killer) {
        m.alive = false;
        m.pendingRespawn = true;
        m.respawnAt = now + (m.respawnIntervalMs > 0 ? m.respawnIntervalMs : RESPAWN_MS);
        m.hp = 0;
        m.targetId = -1;

        dropLoot(m);
        if (killer != null) {
            triggerMapQuest(killer, m);
        }

        JsonObject death = new JsonObject();
        death.addProperty("type", "death");
        death.addProperty("id", m.id);
        broadcastAround(m.map, death, m.x, m.y, SIGHT_RANGE);
    }

    /** 击杀怪物时触发对应地图任务脚本（MapQuest）。 */
    private void triggerMapQuest(Player p, Monster m) {
        if (mapQuests.isEmpty() || m.map == null) {
            return;
        }
        for (WorldData.MapQuestEntry e : mapQuests) {
            if (!e.mapId.equals(m.map.name)) {
                continue;
            }
            if (e.monName.isEmpty() || !e.monName.equals(m.name)) {
                continue;
            }
            if (p.questParams[e.setNumber] != e.value) {
                continue;
            }
            NpcScript script = questScripts.get(e.qfile);
            if (script == null) {
                continue;
            }
            NpcScriptEngine.Result r = npcEngine.executeScript(p, null, script, "main");
            if (!r.sayText.isEmpty()) {
                sendSystem(p, r.sayText);
            }
        }
    }

    // -- item drops / pickup -------------------------------------------------

    public GroundItem groundItem(long id) {
        return groundItems.get(id);
    }

    /** Rolls the monster's MonItems table and scatters drops around its corpse. */
    private void dropLoot(Monster m) {
        List<WorldData.DropEntry> table = dropTables.get(m.template.name);
        if (table == null) {
            return;
        }
        for (WorldData.DropEntry e : table) {
            if (e.selPoint < (int) (Math.random() * e.maxPoint)) {
                continue;
            }
            int[] pos = scatterPos(m.map, m.x, m.y);
            if (pos == null) {
                continue;
            }
            if ("金币".equals(e.itemName)) {
                int gold = (e.count / 2) + (int) (Math.random() * e.count);
                if (gold <= 0) {
                    gold = 1;
                }
                GroundItem gi = GroundItem.ofGold(newId(), gold, pos[0], pos[1]);
                gi.map = m.map;
                groundItems.put(gi.id, gi);
                broadcastItemDrop(gi);
            } else {
                ItemTemplate t = itemTemplateByName(e.itemName);
                if (t == null) {
                    continue;
                }
                int dura = Math.max(1, t.duraMax * (20 + (int) (Math.random() * 81)) / 100);
                ItemInstance it = new ItemInstance(nextItemMakeIndex(), t.index, dura, t.duraMax);
                GroundItem gi = GroundItem.ofItem(newId(), it, pos[0], pos[1]);
                gi.map = m.map;
                groundItems.put(gi.id, gi);
                broadcastItemDrop(gi);
            }
        }
    }

    private int[] scatterPos(GameMap map, int cx, int cy) {
        for (int attempt = 0; attempt < 50; attempt++) {
            int x = cx + (int) (Math.random() * 7) - 3;
            int y = cy + (int) (Math.random() * 7) - 3;
            if (map.canWalk(x, y)) {
                return new int[]{x, y};
            }
        }
        return map.canWalk(cx, cy) ? new int[]{cx, cy} : null;
    }

    private void broadcastItemDrop(GroundItem gi) {
        ItemTemplate t = gi.item != null ? itemTemplates.get(gi.item.index) : null;
        JsonObject o = gi.toJson(t != null ? t.name : "?", t != null ? t.looks : 0);
        o.addProperty("type", "itemDrop");
        broadcastAround(gi.map, o, gi.x, gi.y, SIGHT_RANGE);
    }

    private void broadcastItemRemove(GroundItem gi) {
        JsonObject o = new JsonObject();
        o.addProperty("type", "itemRemove");
        o.addProperty("id", gi.id);
        broadcastAround(gi.map, o, gi.x, gi.y, SIGHT_RANGE);
    }

    /** Player picks up a ground item within 1 tile. Returns true on success. */
    public boolean pickup(Player p, long itemId) {
        GroundItem gi = groundItems.get(itemId);
        if (gi == null || gi.map != p.map) {
            return false;
        }
        if (Math.max(Math.abs(p.x - gi.x), Math.abs(p.y - gi.y)) > 1) {
            return false;
        }
        groundItems.remove(itemId);
        if (gi.isGold()) {
            p.gold += gi.gold;
        } else {
            p.bag.add(gi.item);
        }
        broadcastItemRemove(gi);
        return true;
    }

    /** 玩家主动丢弃背包物品到脚下（原版 CM_DROPITEM）。移除背包 → 生成 GroundItem → 广播。 */
    public boolean dropItem(Player p, int makeIndex) {
        ItemInstance found = null;
        for (ItemInstance it : p.bag) {
            if (it.makeIndex == makeIndex) {
                found = it;
                break;
            }
        }
        if (found == null) {
            return false;
        }
        p.bag.remove(found);
        GroundItem gi = GroundItem.ofItem(newId(), found, p.x, p.y);
        gi.map = p.map;
        groundItems.put(gi.id, gi);
        broadcastItemDrop(gi);
        return true;
    }

    private void respawnDead(long now) {
        for (Actor a : new ArrayList<>(actors.values())) {
            if (!(a instanceof Monster)) {
                continue;
            }
            Monster m = (Monster) a;
            if (m.pendingRespawn && now >= m.respawnAt) {
                m.pendingRespawn = false;
                m.alive = true;
                m.x = m.spawnX;
                m.y = m.spawnY;
                m.hp = m.template.hp;
                m.maxHp = m.template.hp;
                m.targetId = -1;
                GameMap home = m.spawnMap != null ? m.spawnMap : defaultMap;
                if (m.map != null && m.map != home) {
                    m.map.remove(m.id);
                }
                m.map = home;
                home.add(m);
                broadcastEntityAdd(m);
            }
        }
    }

    private int dirTowards(Actor from, Actor to) {
        int sx = Integer.signum(to.x - from.x);
        int sy = Integer.signum(to.y - from.y);
        for (int d = 0; d < 8; d++) {
            if (Integer.signum(Direction.dx(d)) == sx && Integer.signum(Direction.dy(d)) == sy) {
                return d;
            }
        }
        return from.dir;
    }

    /** Notifies everyone in sight that an actor moved. */
    public void broadcastMove(Actor a) {
        JsonObject o = new JsonObject();
        o.addProperty("type", "move");
        o.addProperty("id", a.id);
        o.addProperty("x", a.x);
        o.addProperty("y", a.y);
        o.addProperty("dir", a.dir);
        o.addProperty("run", a.running);
        broadcastAround(a.map, o, a.x, a.y, SIGHT_RANGE);
    }

    /** Notifies everyone in sight that an actor appeared. */
    public void broadcastEntityAdd(Actor a) {
        JsonObject o = new JsonObject();
        o.addProperty("type", "entityAdd");
        o.add("entity", a.toBriefJson());
        broadcastAround(a.map, o, a.x, a.y, SIGHT_RANGE);
    }

    private void sendHits(Actor attacker, Actor target, int damage) {
        JsonObject o = new JsonObject();
        o.addProperty("type", "attack");
        o.addProperty("attackerId", attacker.id);
        o.addProperty("targetId", target.id);
        o.addProperty("damage", damage);
        o.addProperty("x", target.x);
        o.addProperty("y", target.y);
        broadcastAround(target.map, o, target.x, target.y, SIGHT_RANGE);
        sendStats(target, null);
    }

    /** Sends a stats refresh to the owner (players) or to bystanders (monsters). */
    public void sendStats(Actor a, JsonObject extras) {
        JsonObject o = new JsonObject();
        o.addProperty("type", "stats");
        o.addProperty("id", a.id);
        o.addProperty("hp", a.hp);
        o.addProperty("maxHp", a.maxHp);
        o.addProperty("mp", a.mp);
        o.addProperty("maxMp", a.maxMp);
        o.addProperty("level", a.level);
        o.addProperty("exp", a.exp);
        long now = System.currentTimeMillis();
        if (a instanceof Player) {
            Player pl = (Player) a;
            o.addProperty("shield", pl.shieldUntil > now);   // 魔法盾
            o.addProperty("hidden", pl.hideUntil > now);     // 隐身术
            o.addProperty("wideHit", pl.wideHitOn);          // 半月弯刀开关
            o.addProperty("crossHit", pl.crossHitOn);        // 攻杀剑术开关
            o.addProperty("longHit", pl.longHitOn);          // 刺杀剑术开关
            o.addProperty("fireHit", pl.fireHitOn);          // 烈火剑法蓄力
        }
        o.addProperty("poison", a.poisonTicks > 0);          // 施毒术中毒
        if (a instanceof Monster) {
            o.addProperty("paralyzed", ((Monster) a).paralyzedUntil > now);   // 困魔咒/麻痹定身
        }
        if (extras != null) {
            for (String k : extras.keySet()) {
                o.add(k, extras.get(k));
            }
        }
        if (a instanceof Player && ((Player) a).session != null) {
            ((Player) a).session.sendText(o.toString());
        } else {
            broadcastAround(a.map, o, a.x, a.y, SIGHT_RANGE);
        }
    }

    public void sendSystem(Player p, String text) {
        JsonObject o = new JsonObject();
        o.addProperty("type", "systemMessage");
        o.addProperty("text", text);
        p.session.sendText(o.toString());
    }
}