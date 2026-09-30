package com.jootm2.server.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.jootm2.server.config.ServerConfig;
import com.jootm2.server.game.common.Direction;
import com.jootm2.server.game.common.ItemInstance;
import com.jootm2.server.game.common.ItemTemplate;
import com.jootm2.server.game.common.MonsterTemplate;
import com.jootm2.server.game.npc.Npc;
import com.jootm2.server.resource.MapFileReader;
import com.jootm2.server.resource.NpcData;
import com.jootm2.server.resource.WorldData;

import java.io.IOException;
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

    public static final int SIGHT_RANGE = 12;
    public static final int AGGRO_RANGE = 8;
    public static final int MONSTER_COUNT = 30;
    public static final long RESPAWN_MS = 15_000L;
    public static final long REGEN_INTERVAL_MS = 2_000L;

    public final Object lock = new Object();

    public final Map<Integer, ItemTemplate> itemTemplates = new HashMap<>();
    public final Map<String, MonsterTemplate> monsterTemplates = new HashMap<>();
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

    private long lastRegenAt = System.currentTimeMillis();

    public GameWorld(ServerConfig config,
                     Map<Integer, ItemTemplate> itemTemplates,
                     Map<String, MonsterTemplate> monsterTemplates) {
        this.itemTemplates.putAll(itemTemplates);
        this.monsterTemplates.putAll(monsterTemplates);

        Path root = Paths.get(config.gamedataRoot()).toAbsolutePath();
        this.mapDir = root.resolve("Mir200").resolve("Map");
        this.envDir = root.resolve("Mir200").resolve("Envir");

        WorldData.StartPoint sp = WorldData.loadStartPoint(envDir.resolve("StartPoint.txt"));
        this.startX = sp.x;
        this.startY = sp.y;
        this.defaultMap = MapFileReader.read(sp.mapId, mapDir);
        this.maps.put(defaultMap.name, defaultMap);

        scanAvailableMaps();
        loadMapInfo();
        this.monGenEntries = WorldData.loadMonGen(envDir.resolve("MonGen.txt"));
        loadNpcs();
        loadDropTables();
        spawnMonsters(defaultMap);
        attachNpcs(defaultMap);
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

    /** Attempts a single-tile move in the given direction. */
    public boolean tryMove(Actor a, int dir) {
        int nx = a.x + Direction.dx(dir);
        int ny = a.y + Direction.dy(dir);
        a.dir = dir;
        if (!a.map.inside(nx, ny) || !a.map.canWalk(nx, ny)) {
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
                regen((Player) a, now);
            } else if (a instanceof Monster) {
                monsterAi((Monster) a, now);
            }
        }
        respawnDead(now);
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
        Player target = resolveTarget(m);
        m.targetId = target == null ? -1 : target.id;

        if (target != null) {
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

    private Player resolveTarget(Monster m) {
        Player current = m.targetId >= 0 ? (Player) actor(m.targetId) : null;
        if (current != null && current.alive && current.map == m.map
                && current.distanceTo(m) <= AGGRO_RANGE) {
            return current;
        }
        Player best = null;
        int bestDist = Integer.MAX_VALUE;
        for (Player p : players()) {
            if (p.map != m.map) {
                continue;
            }
            int d = p.distanceTo(m);
            if (p.alive && d <= AGGRO_RANGE && d < bestDist) {
                best = p;
                bestDist = d;
            }
        }
        return best;
    }

    private void attackPlayer(Monster m, Player target) {
        int raw = m.rollAttack();
        int dmg = Math.max(1, raw - target.combat.acMax);
        target.hp = Math.max(0, target.hp - dmg);
        sendHits(m, target, dmg);
        if (target.hp <= 0) {
            killPlayer(target);
        }
    }

    public void killPlayer(Player p) {
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
        for (Actor a : nearby(p.map, p.x, p.y, SIGHT_RANGE)) {
            if (a.id != p.id) {
                nearby.add(a.toBriefJson());
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

    /** Marks a monster dead and schedules its respawn (does not remove the Actor). */
    public void killMonster(Monster m, long now) {
        m.alive = false;
        m.pendingRespawn = true;
        m.respawnAt = now + RESPAWN_MS;
        m.hp = 0;
        m.targetId = -1;

        dropLoot(m);

        JsonObject death = new JsonObject();
        death.addProperty("type", "death");
        death.addProperty("id", m.id);
        broadcastAround(m.map, death, m.x, m.y, SIGHT_RANGE);
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