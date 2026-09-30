package com.jootm2.server.service;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.jootm2.server.config.ServerConfig;
import com.jootm2.server.db.Account;
import com.jootm2.server.db.AccountDao;
import com.jootm2.server.db.CharacterDao;
import com.jootm2.server.db.CharacterRecord;
import com.jootm2.server.db.Database;
import com.jootm2.server.game.Actor;
import com.jootm2.server.game.GameMap;
import com.jootm2.server.game.GameWorld;
import com.jootm2.server.game.GroundItem;
import com.jootm2.server.game.Monster;
import com.jootm2.server.game.Player;
import com.jootm2.server.game.common.Direction;
import com.jootm2.server.game.common.ExperienceTable;
import com.jootm2.server.game.common.ItemInstance;
import com.jootm2.server.game.common.ItemTemplate;
import com.jootm2.server.game.npc.Npc;
import com.jootm2.server.game.npc.NpcScriptEngine;
import com.jootm2.server.resource.WorldData;

import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Facade between the network layer and the game engine. All game mutations are
 * serialised on {@link GameWorld#lock} so a single game state can be driven both
 * by message handlers (network worker threads) and by the periodic tick thread.
 */
public final class GameService {

    public static final int MAX_CHARS_PER_ACCOUNT = 2;

    private final ServerConfig config;
    private final Database database;
    private final AccountDao accountDao;
    private final CharacterDao characterDao;
    private final GameWorld world;
    private final NpcScriptEngine npcEngine;

    private final long startedAt = System.currentTimeMillis();
    private final AtomicLong itemSeq = new AtomicLong(1_000_000L);

    public GameService(ServerConfig config, Database database) throws SQLException {
        this.config = config;
        this.database = database;
        this.accountDao = new AccountDao(database);
        this.characterDao = new CharacterDao(database);
        this.world = new GameWorld(config, database.loadItemTemplates(), database.loadMonsterTemplates());
        this.npcEngine = new NpcScriptEngine(world);
    }

    public GameWorld world() {
        return world;
    }

    // ---- WebSocket message entry point ------------------------------------

    public void onMessage(PlayerSession session, String text) {
        JsonObject msg;
        try {
            msg = JsonParser.parseString(text).getAsJsonObject();
        } catch (Exception e) {
            return;
        }
        String type = str(msg, "type");
        if (type == null) {
            return;
        }
        synchronized (world.lock) {
            switch (type) {
                case "ping":
                    session.sendText("{\"type\":\"pong\"}");
                    break;
                case "login":
                    login(session, msg);
                    break;
                case "register":
                    register(session, msg);
                    break;
                case "listCharacters":
                    listCharacters(session);
                    break;
                case "createCharacter":
                    createCharacter(session, msg);
                    break;
                case "deleteCharacter":
                    deleteCharacter(session, msg);
                    break;
                case "enterGame":
                    enterGame(session, msg);
                    break;
                case "move":
                    move(session, msg);
                    break;
                case "say":
                    say(session, msg);
                    break;
                case "attack":
                    attack(session, msg);
                    break;
                case "logout":
                    logout(session);
                    break;
                case "npcTalk":
                    npcTalk(session, msg);
                    break;
                case "npcSelect":
                    npcSelect(session, msg);
                    break;
                case "buyItem":
                    buyItem(session, msg);
                    break;
                case "sellItem":
                    sellItem(session, msg);
                    break;
                case "pickup":
                    pickup(session, msg);
                    break;
                case "useItem":
                    useItem(session, msg);
                    break;
                default:
                    break;
            }
        }
    }

    public void onDisconnect(PlayerSession session) {
        synchronized (world.lock) {
            Player p = findBySession(session);
            if (p != null) {
                persist(p);
                world.removePlayer(p);
                broadcastRemove(p);
            }
        }
    }

    private void login(PlayerSession session, JsonObject msg) {
        String username = str(msg, "username");
        String password = str(msg, "password");
        JsonObject r = new JsonObject();
        r.addProperty("type", "loginResult");
        if (username == null || password == null) {
            r.addProperty("ok", false);
            r.addProperty("error", "请输入账号和密码。");
        } else {
            Account a = accountDao.authenticate(username, password);
            if (a == null) {
                r.addProperty("ok", false);
                r.addProperty("error", "账号或密码错误。");
            } else {
                r.addProperty("ok", true);
                session.setAccountId(a.id);
            }
        }
        session.sendJson(r);
    }

    private void register(PlayerSession session, JsonObject msg) {
        String username = str(msg, "username");
        String password = str(msg, "password");
        JsonObject r = new JsonObject();
        r.addProperty("type", "registerResult");
        if (username == null || username.length() < 2 || password == null || password.length() < 4) {
            r.addProperty("ok", false);
            r.addProperty("error", "账号至少2位，密码至少4位。");
        } else {
            Account a = accountDao.register(username, password);
            if (a == null) {
                r.addProperty("ok", false);
                r.addProperty("error", "账号已存在。");
            } else {
                r.addProperty("ok", true);
            }
        }
        session.sendJson(r);
    }

    private void listCharacters(PlayerSession session) {
        if (session.getAccountId() <= 0) {
            return;
        }
        JsonArray arr = new JsonArray();
        for (CharacterRecord c : characterDao.listByAccount(session.getAccountId())) {
            JsonObject o = new JsonObject();
            o.addProperty("name", c.name);
            o.addProperty("sex", c.sex);
            o.addProperty("hair", c.hair);
            o.addProperty("job", c.job);
            o.addProperty("level", c.level);
            arr.add(o);
        }
        JsonObject r = new JsonObject();
        r.addProperty("type", "characterList");
        r.add("characters", arr);
        session.sendJson(r);
    }

    private void createCharacter(PlayerSession session, JsonObject msg) {
        if (session.getAccountId() <= 0) {
            return;
        }
        JsonObject r = new JsonObject();
        r.addProperty("type", "createCharacterResult");

        String name = str(msg, "name");
        if (name != null) {
            name = name.trim();
        }
        int sex = integer(msg, "sex", 0);
        int hair = integer(msg, "hair", 0);
        int job = Math.max(0, Math.min(2, integer(msg, "job", 0)));

        if (name == null || name.isEmpty() || name.length() > 14) {
            fillError(r, "名字长度需为1-14个字符。");
            session.sendJson(r);
            return;
        }
        if (characterDao.nameExists(name)) {
            fillError(r, "该名字已被使用。");
            session.sendJson(r);
            return;
        }
        if (characterDao.listByAccount(session.getAccountId()).size() >= MAX_CHARS_PER_ACCOUNT) {
            fillError(r, "角色数量已达上限。");
            session.sendJson(r);
            return;
        }

        int[] baseHp = {26, 16, 18};
        int[] baseMp = {12, 20, 16};

        CharacterRecord c = new CharacterRecord();
        c.accountId = session.getAccountId();
        c.name = name;
        c.sex = sex;
        c.hair = hair;
        c.job = job;
        c.level = 1;
        c.exp = 0;
        c.mapName = world.defaultMap.name;
        c.x = world.startX;
        c.y = world.startY;
        c.dir = Direction.DOWN;
        c.hp = baseHp[job];
        c.mp = baseMp[job];
        c.gold = 0;
        c.homeMap = world.defaultMap.name;
        c.homeX = world.startX;
        c.homeY = world.startY;
        c.skills = "[]";
        c.createdAt = System.currentTimeMillis();

        List<ItemInstance> items = new ArrayList<>();
        addStarter(items, 0, 1);
        addStarter(items, 1, 1);
        addStarter(items, 2, 2);
        addStarter(items, 3, 2);
        c.items = items;

        characterDao.insert(c);
        r.addProperty("ok", true);
        session.sendJson(r);
    }

    private void addStarter(List<ItemInstance> items, int itemId, int count) {
        ItemTemplate t = world.itemTemplates.get(itemId);
        if (t == null) {
            return;
        }
        for (int i = 0; i < count; i++) {
            items.add(new ItemInstance((int) itemSeq.incrementAndGet(), itemId,
                    t.duraMax, t.duraMax));
        }
    }

    private void deleteCharacter(PlayerSession session, JsonObject msg) {
        if (session.getAccountId() <= 0) {
            return;
        }
        String name = str(msg, "name");
        JsonObject r = new JsonObject();
        r.addProperty("type", "deleteCharacterResult");
        if (name == null || world.player(name) != null) {
            r.addProperty("ok", false);
            r.addProperty("error", "无法删除（角色在线或名字无效）。");
        } else {
            characterDao.delete(session.getAccountId(), name);
            r.addProperty("ok", true);
        }
        session.sendJson(r);
    }

    private void enterGame(PlayerSession session, JsonObject msg) {
        if (session.getAccountId() <= 0) {
            return;
        }
        String name = str(msg, "name");
        if (name == null) {
            return;
        }
        CharacterRecord rec = characterDao.findByName(name);
        JsonObject r = new JsonObject();
        r.addProperty("type", "enterGameResult");
        if (rec == null || rec.accountId != session.getAccountId()) {
            r.addProperty("ok", false);
            r.addProperty("error", "角色不存在。");
            session.sendJson(r);
            return;
        }
        if (world.player(name) != null) {
            r.addProperty("ok", false);
            r.addProperty("error", "该角色已在线。");
            session.sendJson(r);
            return;
        }

        // 旧角色（还在旧 "default" 地图上）迁移到真实出生地图
        GameMap targetMap = world.getOrLoadMap(rec.mapName);
        if (targetMap == null) {
            rec.mapName = world.defaultMap.name;
            rec.x = world.startX;
            rec.y = world.startY;
            rec.homeMap = world.defaultMap.name;
            rec.homeX = world.startX;
            rec.homeY = world.startY;
            targetMap = world.defaultMap;
        }

        Player p = new Player(world.newId(), rec.accountId);
        p.characterId = rec.id;
        p.name = rec.name;
        p.sex = rec.sex;
        p.hair = rec.hair;
        p.job = rec.job;
        p.gold = rec.gold;
        p.level = rec.level;
        p.exp = rec.exp;
        p.homeMap = rec.homeMap;
        p.homeX = rec.homeX;
        p.homeY = rec.homeY;
        p.map = targetMap;
        p.x = rec.x;
        p.y = rec.y;
        p.dir = rec.dir;
        p.hp = rec.hp;
        p.mp = rec.mp;
        p.bag.addAll(rec.items);
        p.distributeItems(world);
        p.recompute(world);
        p.hp = p.maxHp;
        p.mp = p.maxMp;
        p.session = session;
        session.setPlayerName(p.name);
        world.addPlayer(p);

        r.addProperty("ok", true);
        session.sendJson(r);

        session.sendText(world.mapSnapshot(p, "enterGame").toString());

        world.broadcastEntityAdd(p);
    }

    private void move(PlayerSession session, JsonObject msg) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        int dir = integer(msg, "dir", -1);
        if (dir < 0 || dir > 7) {
            return;
        }
        int oldX = p.x;
        int oldY = p.y;
        world.tryMove(p, dir);
        world.broadcastMove(p);
        if (p.x != oldX || p.y != oldY) {
            WorldData.Gate gate = world.gateAt(p.map.name, p.x, p.y);
            if (gate != null) {
                doChangeMap(p, gate);
            }
        }
    }

    private void doChangeMap(Player p, WorldData.Gate gate) {
        JsonObject remove = new JsonObject();
        remove.addProperty("type", "entityRemove");
        remove.addProperty("id", p.id);
        world.broadcastAround(p.map, remove, p.x, p.y, GameWorld.SIGHT_RANGE);

        GameMap target = world.changeMap(p, gate.dstMap, gate.dstX, gate.dstY);
        if (target == null) {
            return;
        }
        p.session.sendText(world.mapSnapshot(p, "changeMap").toString());
        world.broadcastEntityAdd(p);
    }

    // ---- NPC interaction ---------------------------------------------------

    private void npcTalk(PlayerSession session, JsonObject msg) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        Npc npc = world.npc(longVal(msg, "npcId", -1));
        if (npc == null || p.distanceTo(npc) > 3) {
            return;
        }
        handleNpcResult(session, p, npc, npcEngine.execute(p, npc, "main"));
    }

    private void npcSelect(PlayerSession session, JsonObject msg) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        Npc npc = world.npc(longVal(msg, "npcId", -1));
        if (npc == null || p.distanceTo(npc) > 3) {
            return;
        }
        String value = str(msg, "value");
        if (value == null || value.isEmpty()) {
            value = "main";
        }
        if ("exit".equals(value) || "@exit".equals(value)) {
            sendNpcClose(session, npc.id);
            return;
        }
        String label = value.startsWith("@") ? value.substring(1) : value;
        boolean isBuy = "buy".equals(label);
        boolean isSell = "sell".equals(label);
        NpcScriptEngine.Result r = npcEngine.execute(p, npc, label);
        if (isBuy) {
            r.shopMode = "buy";
        } else if (isSell) {
            r.shopMode = "sell";
        }
        handleNpcResult(session, p, npc, r);
    }

    private void handleNpcResult(PlayerSession session, Player p, Npc npc, NpcScriptEngine.Result r) {
        if (r.moved && r.movedMap != null) {
            session.sendText(world.mapSnapshot(p, "changeMap").toString());
            world.broadcastEntityAdd(p);
            return;
        }
        if (r.closed) {
            sendNpcClose(session, npc.id);
            return;
        }
        JsonObject o = new JsonObject();
        o.addProperty("type", "npcSay");
        o.addProperty("npcId", npc.id);
        o.addProperty("name", npc.name);
        o.addProperty("text", r.sayText);
        JsonArray opts = new JsonArray();
        for (NpcScriptEngine.Option op : r.options) {
            JsonObject e = new JsonObject();
            e.addProperty("label", op.label);
            e.addProperty("value", op.value);
            opts.add(e);
        }
        o.add("options", opts);
        if (r.shopMode != null) {
            o.addProperty("shop", r.shopMode);
            JsonArray goods = new JsonArray();
            for (NpcScriptEngine.GoodsEntry g : npcEngine.goods(npc)) {
                JsonObject e = new JsonObject();
                e.addProperty("index", g.index);
                e.addProperty("name", g.name);
                e.addProperty("price", g.price);
                e.addProperty("stock", g.stock);
                goods.add(e);
            }
            o.add("goods", goods);
        }
        session.sendText(o.toString());
    }

    private void sendNpcClose(PlayerSession session, long npcId) {
        JsonObject o = new JsonObject();
        o.addProperty("type", "npcClose");
        o.addProperty("npcId", npcId);
        session.sendText(o.toString());
    }

    private void buyItem(PlayerSession session, JsonObject msg) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        Npc npc = world.npc(longVal(msg, "npcId", -1));
        if (npc == null) {
            return;
        }
        int index = integer(msg, "index", -1);
        int count = Math.max(1, integer(msg, "count", 1));
        ItemTemplate t = world.itemTemplates.get(index);
        if (t == null) {
            world.sendSystem(p, "物品不存在。");
            return;
        }
        long total = (long) buyPrice(npc, t) * count;
        if (p.gold < total) {
            world.sendSystem(p, "金币不足。");
            return;
        }
        p.gold -= total;
        world.giveItem(p, t.name, count);
        world.sendSystem(p, "购买了 " + t.name + " x" + count + "，花费 " + total + " 金币。");
    }

    private int buyPrice(Npc npc, ItemTemplate t) {
        for (NpcScriptEngine.GoodsEntry g : npcEngine.goods(npc)) {
            if (g.index == t.index) {
                return g.price;
            }
        }
        return Math.max(1, t.price);
    }

    private void sellItem(PlayerSession session, JsonObject msg) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        Npc npc = world.npc(longVal(msg, "npcId", -1));
        if (npc == null) {
            return;
        }
        int makeIndex = integer(msg, "makeIndex", -1);
        ItemInstance found = null;
        for (ItemInstance it : p.bag) {
            if (it.makeIndex == makeIndex) {
                found = it;
                break;
            }
        }
        if (found == null) {
            world.sendSystem(p, "物品不存在。");
            return;
        }
        ItemTemplate t = world.itemTemplates.get(found.index);
        if (t == null) {
            return;
        }
        int price = Math.max(1, t.price / 2);
        p.bag.remove(found);
        p.gold += price;
        world.sendSystem(p, "出售了 " + t.name + "，获得 " + price + " 金币。");
    }

    private void pickup(PlayerSession session, JsonObject msg) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        long itemId = longVal(msg, "itemId", -1);
        GroundItem gi = world.groundItem(itemId);
        if (world.pickup(p, itemId)) {
            String label = "物品";
            if (gi != null && gi.isGold()) {
                label = gi.gold + " 金币";
            } else if (gi != null && gi.item != null) {
                ItemTemplate t = world.itemTemplates.get(gi.item.index);
                label = t != null ? t.name : "物品";
            }
            world.sendSystem(p, "拾取了 " + label + "。");
            world.sendStats(p, null);
        }
    }

    private void useItem(PlayerSession session, JsonObject msg) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        int makeIndex = integer(msg, "makeIndex", -1);
        ItemInstance found = null;
        for (ItemInstance it : p.bag) {
            if (it.makeIndex == makeIndex) {
                found = it;
                break;
            }
        }
        if (found == null) {
            world.sendSystem(p, "物品不存在。");
            return;
        }
        ItemTemplate t = world.itemTemplates.get(found.index);
        if (t == null) {
            return;
        }
        if (t.stdMode >= 0 && t.stdMode <= 2) {
            consume(p, t, found);
        } else if (Player.slotFor(t) >= 0) {
            equip(p, t, found);
        } else {
            world.sendSystem(p, "无法使用该物品。");
        }
    }

    private void consume(Player p, ItemTemplate t, ItemInstance it) {
        boolean used = false;
        if (t.stdMode <= 2) {
            // 消耗品语义重载：AC = HP 恢复量，MAC = MP 恢复量（TStdItem 对药水/食物的字段复用）
            if (t.acMin > 0) {
                p.hp = Math.min(p.maxHp, p.hp + t.acMin);
                used = true;
            }
            if (t.macMin > 0) {
                p.mp = Math.min(p.maxMp, p.mp + t.macMin);
                used = true;
            }
            if (!used) {
                p.hp = p.maxHp;   // 食物类：回满 HP
                used = true;
            }
        }
        if (used) {
            p.bag.remove(it);
            world.sendStats(p, null);
            world.sendSystem(p, "使用了 " + t.name + "。");
        } else {
            world.sendSystem(p, "现在无法使用该物品。");
        }
    }

    private void equip(Player p, ItemTemplate t, ItemInstance it) {
        int slot = Player.slotFor(t);
        if (slot < 0) {
            world.sendSystem(p, "无法装备该物品。");
            return;
        }
        if (t.needLevel > p.level) {
            world.sendSystem(p, "等级不足，需要 " + t.needLevel + " 级。");
            return;
        }
        p.bag.remove(it);
        ItemInstance old = p.equipment[slot];
        if (old != null) {
            p.bag.add(old);
        }
        p.equipment[slot] = it;
        p.recompute(world);
        world.sendStats(p, null);
        world.sendSystem(p, "装备了 " + t.name + "。");
    }

    private void say(PlayerSession session, JsonObject msg) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        String text = str(msg, "text");
        if (text == null || text.isEmpty()) {
            return;
        }
        if (text.length() > 500) {
            text = text.substring(0, 500);
        }
        JsonObject o = new JsonObject();
        o.addProperty("type", "chat");
        o.addProperty("id", p.id);
        o.addProperty("name", p.name);
        o.addProperty("text", text);
        world.broadcastAll(o);
    }

    private void attack(PlayerSession session, JsonObject msg) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        long targetId = -1L;
        try {
            if (msg.has("targetId")) {
                targetId = msg.get("targetId").getAsLong();
            }
        } catch (Exception ignored) {
        }
        Actor a = world.actor(targetId);
        if (!(a instanceof Monster) || !a.alive) {
            return;
        }
        Monster m = (Monster) a;
        if (p.distanceTo(m) > 1) {
            return;
        }
        int raw = p.combat.rollDc();
        int dmg = Math.max(1, raw - m.template.ac);
        m.hp = Math.max(0, m.hp - dmg);

        JsonObject o = new JsonObject();
        o.addProperty("type", "attack");
        o.addProperty("attackerId", p.id);
        o.addProperty("targetId", m.id);
        o.addProperty("damage", dmg);
        o.addProperty("x", m.x);
        o.addProperty("y", m.y);
        world.broadcastAround(m.map, o, m.x, m.y, GameWorld.SIGHT_RANGE);
        world.sendStats(m, null);

        if (m.hp <= 0) {
            world.killMonster(m, System.currentTimeMillis());
            grantExp(p, m);
        }
    }

    private void grantExp(Player p, Monster m) {
        p.exp += m.template.exp;
        int oldLevel = p.level;
        int newLevel = ExperienceTable.levelForExp(p.exp);
        if (newLevel > oldLevel) {
            p.level = newLevel;
            p.recompute(world);
            p.hp = p.maxHp;
            p.mp = p.maxMp;
            world.sendSystem(p, "恭喜！你升到了 " + newLevel + " 级。");
        }
        world.sendStats(p, null);
    }

    private void logout(PlayerSession session) {
        Player p = findBySession(session);
        if (p != null) {
            persist(p);
            world.removePlayer(p);
            broadcastRemove(p);
        }
        session.close();
    }

    private Player findBySession(PlayerSession session) {
        for (Player p : world.players()) {
            if (p.session == session) {
                return p;
            }
        }
        return null;
    }

    private void broadcastRemove(Player p) {
        JsonObject o = new JsonObject();
        o.addProperty("type", "entityRemove");
        o.addProperty("id", p.id);
        world.broadcastAround(p.map, o, p.x, p.y, GameWorld.SIGHT_RANGE);
    }

    private void persist(Player p) {
        characterDao.update(toRecord(p));
    }

    private CharacterRecord toRecord(Player p) {
        CharacterRecord r = new CharacterRecord();
        r.id = p.characterId;
        r.accountId = p.accountId;
        r.name = p.name;
        r.sex = p.sex;
        r.hair = p.hair;
        r.job = p.job;
        r.level = p.level;
        r.exp = p.exp;
        r.mapName = p.map != null ? p.map.name : "default";
        r.x = p.x;
        r.y = p.y;
        r.dir = p.dir;
        r.hp = p.hp;
        r.mp = p.mp;
        r.gold = p.gold;
        r.homeMap = p.homeMap;
        r.homeX = p.homeX;
        r.homeY = p.homeY;
        List<ItemInstance> all = new ArrayList<>(p.bag);
        for (ItemInstance it : p.equipment) {
            if (it != null) {
                all.add(it);
            }
        }
        r.items = all;
        r.skills = "[]";
        return r;
    }

    // ---- periodic tasks -----------------------------------------------------

    public void tick() {
        synchronized (world.lock) {
            world.tick(System.currentTimeMillis());
        }
    }

    public void saveAllPlayers() {
        synchronized (world.lock) {
            for (Player p : world.players()) {
                persist(p);
            }
        }
    }

    // ---- admin REST API -----------------------------------------------------

    public String handleAdmin(String method, String path, Map<String, String> query, byte[] body) {
        synchronized (world.lock) {
            if (path.equals("/api/status")) {
                JsonObject o = new JsonObject();
                o.addProperty("onlinePlayers", world.onlineCount());
                o.addProperty("monsters", world.monsterCount());
                o.addProperty("uptimeMs", System.currentTimeMillis() - startedAt);
                o.addProperty("playerSpawnX", config.playerSpawnX());
                o.addProperty("playerSpawnY", config.playerSpawnY());
                return o.toString();
            }
            if (path.equals("/api/players")) {
                JsonArray arr = new JsonArray();
                for (Player p : world.players()) {
                    JsonObject o = new JsonObject();
                    o.addProperty("id", p.id);
                    o.addProperty("name", p.name);
                    o.addProperty("level", p.level);
                    o.addProperty("job", p.job);
                    o.addProperty("x", p.x);
                    o.addProperty("y", p.y);
                    o.addProperty("hp", p.hp);
                    o.addProperty("maxHp", p.maxHp);
                    arr.add(o);
                }
                JsonObject o = new JsonObject();
                o.add("players", arr);
                return o.toString();
            }
            if (path.equals("/api/broadcast") && "POST".equalsIgnoreCase(method)) {
                String text = "";
                try {
                    JsonObject in = JsonParser
                            .parseString(new String(body, StandardCharsets.UTF_8))
                            .getAsJsonObject();
                    if (in.has("text")) {
                        text = in.get("text").getAsString();
                    }
                } catch (Exception ignored) {
                }
                if (!text.isEmpty()) {
                    JsonObject o = new JsonObject();
                    o.addProperty("type", "systemMessage");
                    o.addProperty("text", "[公告] " + text);
                    world.broadcastAll(o);
                }
                JsonObject r = new JsonObject();
                r.addProperty("ok", true);
                return r.toString();
            }
        }
        return null;
    }

    // ---- JSON helpers -------------------------------------------------------

    private static String str(JsonObject o, String key) {
        if (o == null || !o.has(key)) {
            return null;
        }
        try {
            return o.get(key).getAsString();
        } catch (Exception e) {
            return null;
        }
    }

    private static long longVal(JsonObject o, String key, long def) {
        if (o == null || !o.has(key) || o.get(key).isJsonNull()) {
            return def;
        }
        try {
            return o.get(key).getAsLong();
        } catch (Exception e) {
            return def;
        }
    }

    private static int integer(JsonObject o, String key, int def) {
        if (o == null || !o.has(key) || o.get(key).isJsonNull()) {
            return def;
        }
        try {
            return o.get(key).getAsInt();
        } catch (Exception e) {
            return def;
        }
    }

    private static void fillError(JsonObject r, String error) {
        r.addProperty("ok", false);
        r.addProperty("error", error);
    }
}