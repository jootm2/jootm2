package com.jootm2.server.service;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
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
import com.jootm2.server.game.Guild;
import com.jootm2.server.game.Monster;
import com.jootm2.server.game.Party;
import com.jootm2.server.game.Player;
import com.jootm2.server.game.common.Direction;
import com.jootm2.server.game.common.ExperienceTable;
import com.jootm2.server.game.common.ItemInstance;
import com.jootm2.server.game.common.ItemTemplate;
import com.jootm2.server.game.common.MagicTemplate;
import com.jootm2.server.game.common.MessageIds;
import com.jootm2.server.game.common.Skill;
import com.jootm2.server.game.npc.Npc;
import com.jootm2.server.game.npc.NpcScriptEngine;
import com.jootm2.server.resource.WorldData;

import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashMap;
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

    // 交易状态
    private final Map<Long, Long> tradeRequests = new HashMap<>();   // targetId -> requesterId
    private final Map<Long, TradeSession> trades = new HashMap<>();  // playerId -> session

    public GameService(ServerConfig config, Database database) throws SQLException {
        this.config = config;
        this.database = database;
        this.accountDao = new AccountDao(database);
        this.characterDao = new CharacterDao(database);
        this.world = new GameWorld(config, database.loadItemTemplates(), database.loadMonsterTemplates(), database.loadMagicTemplates());
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
                case "castMagic":
                    castMagic(session, msg);
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
                case "createGuild":
                    createGuild(session, msg);
                    break;
                case "joinGuild":
                    joinGuild(session, msg);
                    break;
                case "leaveGuild":
                    leaveGuild(session);
                    break;
                case "guildInfo":
                    guildInfo(session);
                    break;
                case "guildChat":
                    guildChat(session, msg);
                    break;
                case "siege":
                    siege(session, msg);
                    break;
                case "guildWar":
                    guildWar(session, msg);
                    break;
                case "guildAlly":
                    guildAlly(session, msg);
                    break;
                case "partyInvite":
                    partyInvite(session, msg);
                    break;
                case "partyLeave":
                    partyLeave(session);
                    break;
                case "partyChat":
                    partyChat(session, msg);
                    break;
                case "storageOpen":
                    storageOpen(session);
                    break;
                case "storageStore":
                    storageStore(session, msg);
                    break;
                case "storageTake":
                    storageTake(session, msg);
                    break;
                case "tradeRequest":
                    tradeRequest(session, msg);
                    break;
                case "tradeAccept":
                    tradeAccept(session);
                    break;
                case "tradeCancel":
                    tradeCancel(session);
                    break;
                case "tradeAddItem":
                    tradeAddItem(session, msg);
                    break;
                case "tradeAddGold":
                    tradeAddGold(session, msg);
                    break;
                case "tradeConfirm":
                    tradeConfirm(session);
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
        c.skills = starterSkills(job);
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

    /** 初始技能（按职业）：战士=基本剑术(3)，法师=火球术(1)，道士=治愈术(2)。 */
    private String starterSkills(int job) {
        int mid = job == 0 ? 3 : (job == 1 ? 1 : 2);
        JsonObject o = new JsonObject();
        JsonObject s = new JsonObject();
        s.addProperty("level", 0);
        s.addProperty("train", 0);
        o.add(String.valueOf(mid), s);
        return o.toString();
    }

    /** 从持久化的 skills JSON 恢复到玩家内存技能表（{magicId:{level,train}}）。 */
    private void loadSkills(Player p, String json) {
        p.skills.clear();
        if (json == null || json.isEmpty()) {
            return;
        }
        try {
            JsonObject o = JsonParser.parseString(json).getAsJsonObject();
            for (String k : o.keySet()) {
                Skill s = new Skill();
                JsonElement e = o.get(k);
                if (e != null && e.isJsonObject()) {
                    JsonObject so = e.getAsJsonObject();
                    s.level = so.has("level") ? so.get("level").getAsInt() : 0;
                    s.curTrain = so.has("train") ? so.get("train").getAsInt() : 0;
                } else if (e != null && e.isJsonPrimitive()) {
                    s.level = e.getAsInt();   // 兼容旧格式 {magicId:level}
                }
                p.skills.put(Integer.parseInt(k), s);
            }
        } catch (Exception ignored) {
        }
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
        p.world = world;
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
        loadSkills(p, rec.skills);
        p.bag.addAll(rec.items);
        p.storage.addAll(rec.storage);
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
        // 走/跑动作类型（客户端按此播放 walk/run 动画）
        p.running = msg.has("run") && msg.get("run").getAsBoolean();
        int oldX = p.x;
        int oldY = p.y;
        world.tryMove(p, dir);
        world.broadcastMove(p);
        if (p.x != oldX || p.y != oldY) {
            world.updateSight(p);   // 增量更新视野：广播新进入/离开的实体
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
        sendBagUpdate(p);
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
        sendBagUpdate(p);
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
            sendBagUpdate(p);
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
        if (t.stdMode == 4) {
            learnSkillBook(p, t, found);
        } else if (t.stdMode >= 0 && t.stdMode <= 2) {
            consume(p, t, found);
        } else if (t.stdMode == 3) {
            useBlessOil(p, t, found);
        } else if (Player.slotFor(t) >= 0) {
            equip(p, t, found);
        } else {
            world.sendSystem(p, "无法使用该物品。");
        }
    }

    /** 使用祝福油（stdMode=3）提升/诅咒武器幸运。 */
    private void useBlessOil(Player p, ItemTemplate oil, ItemInstance it) {
        ItemInstance weapon = p.equipment[MessageIds.U_WEAPON];
        if (weapon == null) {
            world.sendSystem(p, "请先装备武器。");
            return;
        }
        if (weapon.lucky >= 7) {
            world.sendSystem(p, "武器幸运已满（+7）。");
            return;
        }
        p.bag.remove(it);
        double r = Math.random();
        if (r < 0.5) {
            weapon.lucky++;
            world.sendSystem(p, "祝福油生效，武器幸运 +1（当前 " + weapon.lucky + "）。");
        } else if (r < 0.8) {
            world.sendSystem(p, "祝福油无效，武器幸运不变。");
        } else {
            weapon.lucky = Math.max(0, weapon.lucky - 1);
            world.sendSystem(p, "诅咒！武器幸运 -1（当前 " + weapon.lucky + "）。");
        }
        p.recompute(world);
        world.sendStats(p, null);
        sendBagUpdate(p);
    }

    /** 使用技能书（stdMode=4）学习对应魔法。技能书名字 = 魔法名。 */
    private void learnSkillBook(Player p, ItemTemplate book, ItemInstance it) {
        MagicTemplate mt = null;
        for (MagicTemplate m : world.magicTemplates.values()) {
            if (m.name.equals(book.name)) {
                mt = m;
                break;
            }
        }
        if (mt == null) {
            world.sendSystem(p, "无效的技能书。");
            return;
        }
        if (p.skills.containsKey(mt.magId)) {
            world.sendSystem(p, "你已经学会了该技能。");
            return;
        }
        if (mt.job != 99 && mt.job != p.job) {
            world.sendSystem(p, "职业不符，无法学习。");
            return;
        }
        if (p.level < mt.needLevel[0]) {
            world.sendSystem(p, "等级不足，需要 " + mt.needLevel[0] + " 级。");
            return;
        }
        p.skills.put(mt.magId, new Skill(0));
        p.bag.remove(it);
        world.sendSystem(p, "学会了 " + mt.name + "！");
        sendBagUpdate(p);
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
            sendBagUpdate(p);
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
        sendBagUpdate(p);
        world.broadcastEntityAdd(p);   // 其他玩家看到 dress/weapon 外观变化
    }

    /** Pushes the full inventory + gold to the player's client. */
    private void sendBagUpdate(Player p) {
        if (p.session == null) {
            return;
        }
        JsonObject o = new JsonObject();
        o.addProperty("type", "bagUpdate");
        o.addProperty("gold", p.gold);
        o.addProperty("dress", p.dressLooks());
        o.addProperty("weapon", p.weaponShape());
        o.add("items", p.itemsJson(world));
        p.session.sendText(o.toString());
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
        m.lastHiterId = p.id;   // 记录仇恨（守卫据此反击）
        if (!hitCheck(p, m)) {
            world.sendSystem(p, "攻击未命中。");
            return;
        }
        int raw = rollDcWithLuck(p);
        int dmg = Math.max(1, raw - m.template.ac);
        m.hp = Math.max(0, m.hp - dmg);

        // 吸血：按伤害回血
        if (p.suckHealthRate > 0) {
            int heal = dmg * p.suckHealthRate / 100;
            if (heal > 0) {
                p.hp = Math.min(p.maxHp, p.hp + heal);
            }
        }
        // 麻痹武器：概率定身目标
        if (p.paralysisWeapon && Math.random() < 0.15) {
            m.paralyzedUntil = System.currentTimeMillis() + 2000;
            world.sendSystem(p, "麻痹了 " + m.name + "！");
        }

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
            world.killMonster(m, System.currentTimeMillis(), p);
            grantExp(p, m);
        }
    }

    /** 攻击掷骰：幸运 N 表示有 N/10 概率打出最高攻击（对齐 WeaponStrong 语义）。 */
    private int rollDcWithLuck(Player p) {
        int min = p.combat.dcMin;
        int max = p.combat.dcMax;
        if (max <= min) {
            return min;
        }
        if (p.luck > 0 && Math.random() * 10 < p.luck) {
            return max;
        }
        return min + (int) (Math.random() * (max - min + 1));
    }

    /** Casts a learned magic (single-target damage, healing or a utility magic). */
    private void castMagic(PlayerSession session, JsonObject msg) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        int magicId = integer(msg, "magicId", -1);
        long targetId = longVal(msg, "targetId", -1);
        MagicTemplate t = world.magicTemplates.get(magicId);
        if (t == null) {
            return;
        }
        Skill skill = p.skills.get(magicId);
        if (skill == null) {
            world.sendSystem(p, "尚未学会该技能。");
            return;
        }
        int lv = skill.level;
        int spellCost = spellCost(t, lv);
        if (p.mp < spellCost) {
            world.sendSystem(p, "魔法值不足。");
            return;
        }
        long now = System.currentTimeMillis();
        Long last = p.skillCooldown.get(magicId);
        if (last != null && now - last < t.delay) {
            return;   // 冷却中
        }

        // 广播施法动画
        JsonObject cast = new JsonObject();
        cast.addProperty("type", "spellCast");
        cast.addProperty("casterId", p.id);
        cast.addProperty("magicId", magicId);
        cast.addProperty("effect", t.effect);
        world.broadcastAround(p.map, cast, p.x, p.y, GameWorld.SIGHT_RANGE);

        boolean success = false;
        if (isHealMagic(magicId)) {
            int heal = t.power + (int) (Math.random() * (t.maxPower - t.power + 1));
            p.hp = Math.min(p.maxHp, p.hp + heal);
            world.sendSystem(p, "施展了 " + t.name + "，恢复 " + heal + " 点生命。");
            world.sendStats(p, null);
            success = true;
        } else if (isDamageMagic(magicId)) {
            Actor a = world.actor(targetId);
            if (a instanceof Monster && a.alive) {
                Monster m = (Monster) a;
                if (p.distanceTo(m) > 8) {
                    return;
                }
                // 魔法躲避（AntiMagic）判定
                if (Math.random() * 10 < 1 + m.template.mac / 5) {
                    world.sendSystem(p, "魔法被躲过了。");
                } else {
                    int damage = magicDamage(p, t, lv, m);
                    m.hp = Math.max(0, m.hp - damage);
                    JsonObject o = new JsonObject();
                    o.addProperty("type", "attack");
                    o.addProperty("attackerId", p.id);
                    o.addProperty("targetId", m.id);
                    o.addProperty("damage", damage);
                    o.addProperty("magicId", magicId);
                    o.addProperty("x", m.x);
                    o.addProperty("y", m.y);
                    world.broadcastAround(m.map, o, m.x, m.y, GameWorld.SIGHT_RANGE);
                    world.sendStats(m, null);
                    if (m.hp <= 0) {
                        world.killMonster(m, now, p);
                        grantExp(p, m);
                    }
                    success = true;
                }
            }
        } else if (magicId == 6) {
            // 施毒术：目标中毒（持续掉血）
            Actor a = world.actor(targetId);
            if (a instanceof Monster && a.alive) {
                Monster m = (Monster) a;
                m.poisonTicks = 10;
                m.poisonDamage = Math.max(1, p.combat.scMin / 2 + lv + 1);
                m.lastPoisonAt = now;
                world.sendSystem(p, "对 " + m.name + " 施放了 " + t.name + "。");
                success = true;
            }
        } else if (magicId == 17 || magicId == 30) {
            // 召唤骷髅 / 召唤神兽：创建宠物
            Monster old = p.summonId >= 0 ? (Monster) world.actor(p.summonId) : null;
            if (old != null && old.alive) {
                world.removeSummon(old);
            }
            String monName = magicId == 17 ? "骷髅" : "神兽";
            Monster summon = world.spawnSummon(p, monName);
            if (summon != null) {
                p.summonId = summon.id;
                world.sendSystem(p, "召唤了 " + summon.name + "。");
                success = true;
            } else {
                world.sendSystem(p, "召唤失败。");
            }
        } else if (magicId == 8 || magicId == 37) {
            // 抗拒火环 / 气功波：推开周围怪物
            int pushed = pushAround(p, lv);
            world.sendSystem(p, pushed > 0 ? "推开了 " + pushed + " 个敌人。" : "周围没有可推开的敌人。");
            success = true;
        } else if (magicId == 21) {
            // 瞬息移动：随机传送
            randomTeleport(p);
            success = true;
        } else if (magicId == 18 || magicId == 19) {
            // 隐身术 / 集体隐身术：怪物丢失目标
            int dur = (30 + 3 * p.combat.scMax) * 1000;
            p.hideUntil = now + dur;
            world.sendSystem(p, "你进入了隐身状态（" + (dur / 1000) + " 秒）。");
            success = true;
        } else if (magicId == 22) {
            // 火墙：目标周围十字 5 格持续伤害
            int damage = Math.max(1, p.combat.mcMax + t.power + lv * 2);
            int made = world.makeFireWall(p, targetId, damage, 8 + lv * 2);
            world.sendSystem(p, made > 0 ? "释放了火墙。(" + made + " 格)" : "火墙释放失败。");
            success = made > 0;
        } else if (magicId == 20) {
            // 诱惑之光：迷惑怪物成为宠物 / 定身已有宠物
            Actor a = world.actor(targetId);
            if (a instanceof Monster && a.alive) {
                Monster m = (Monster) a;
                if (m.masterId == p.id) {
                    m.paralyzedUntil = now + (10 + lv * 5) * 1000;
                    world.sendSystem(p, m.name + " 被定身了。");
                    success = true;
                } else if (Math.random() < 0.05 + lv * 0.05) {
                    m.masterId = p.id;
                    p.summonId = m.id;
                    world.sendSystem(p, "诱惑了 " + m.name + "！");
                    success = true;
                } else {
                    world.sendSystem(p, "诱惑失败。");
                    success = true;
                }
            }
        } else {
            world.sendSystem(p, "该魔法暂未开放。");
            return;
        }

        p.mp -= spellCost;
        p.skillCooldown.put(magicId, now);

        // 熟练度增长与升级（仅技能未满级时）
        if (success && skill.level < 3) {
            skill.curTrain += 1 + (int) (Math.random() * 3);
            if (skill.curTrain >= t.maxTrain[lv]) {
                skill.curTrain -= t.maxTrain[lv];
                skill.level = lv + 1;
                world.sendSystem(p, "你的 " + t.name + " 升到了 " + (skill.level + 1) + " 级！");
            }
        }
        world.sendStats(p, null);
    }

    /** MP cost scaled by skill level (mirrors GetSpellPoint in Delphi). */
    private int spellCost(MagicTemplate t, int lv) {
        return Math.round((float) t.spell / 4 * (lv + 1)) + t.defSpell;
    }

    private boolean isHealMagic(int magicId) {
        return magicId == 2 || magicId == 24;   // 治愈术 / 群体治愈术
    }

    private boolean isDamageMagic(int magicId) {
        return magicId == 1 || magicId == 5 || magicId == 11 || magicId == 35;   // 火球/大火球/雷电/灭天火
    }

    /** Magic damage: base power scaled by skill level, plus MC, minus target MAC. */
    private int magicDamage(Player p, MagicTemplate t, int lv, Monster m) {
        int base = t.power + (int) (Math.random() * (t.maxPower - t.power + 1));
        int scaled = Math.round((float) base / 4 * (lv + 1)) + t.defPower
                + (int) (Math.random() * Math.max(1, t.defMaxPower - t.defPower + 1));
        int mc = p.combat.mcMin + (int) (Math.random() * (p.combat.mcMax - p.combat.mcMin + 1));
        int mac = m.template.mac;
        return Math.max(1, scaled + mc - mac);
    }

    /** 抗拒火环/气功波：推开周围 1 格内的怪物。 */
    private int pushAround(Player p, int level) {
        int pushed = 0;
        for (Actor a : world.nearby(p.map, p.x, p.y, 1)) {
            if (!(a instanceof Monster) || !a.alive) {
                continue;
            }
            Monster m = (Monster) a;
            if (p.level <= m.level) {
                continue;
            }
            int levelgap = p.level - m.level;
            if (Math.random() * 20 >= 6 + level * 3 + levelgap) {
                continue;
            }
            int push = 1 + Math.max(0, level - 1) + (int) (Math.random() * 2);
            int dir = directionFrom(p.x, p.y, m.x, m.y);
            pushCreature(m, dir, push);
            pushed++;
        }
        return pushed;
    }

    /** 瞬息移动：随机传送到附近可走、无人的格子。 */
    private void randomTeleport(Player p) {
        for (int attempt = 0; attempt < 100; attempt++) {
            int nx = p.x + (int) (Math.random() * 9) - 4;
            int ny = p.y + (int) (Math.random() * 9) - 4;
            if (p.map.canWalk(nx, ny) && !p.map.isOccupied(nx, ny)) {
                p.map.remove(p.id);
                p.x = nx;
                p.y = ny;
                p.map.add(p);
                world.broadcastMove(p);
                return;
            }
        }
        world.sendSystem(p, "传送失败。");
    }

    /** 沿方向把怪物推若干格（遇到阻挡/占位停止）。 */
    private void pushCreature(Monster m, int dir, int push) {
        int dx = Direction.dx(dir);
        int dy = Direction.dy(dir);
        int x = m.x;
        int y = m.y;
        for (int i = 0; i < push; i++) {
            int nx = x + dx;
            int ny = y + dy;
            if (!m.map.canWalk(nx, ny) || m.map.isOccupied(nx, ny)) {
                break;
            }
            x = nx;
            y = ny;
        }
        if (x != m.x || y != m.y) {
            m.map.remove(m.id);
            m.x = x;
            m.y = y;
            m.map.add(m);
            world.broadcastMove(m);
        }
    }

    /** 8 方向：从 (fx,fy) 指向 (tx,ty)。 */
    private int directionFrom(int fx, int fy, int tx, int ty) {
        int dx = Integer.signum(tx - fx);
        int dy = Integer.signum(ty - fy);
        if (dy == -1 && dx == 0) return 0;
        if (dy == -1 && dx == 1) return 1;
        if (dy == 0 && dx == 1) return 2;
        if (dy == 1 && dx == 1) return 3;
        if (dy == 1 && dx == 0) return 4;
        if (dy == 1 && dx == -1) return 5;
        if (dy == 0 && dx == -1) return 6;
        if (dy == -1 && dx == -1) return 7;
        return 0;
    }

    /** 命中判定：命中 vs 敏捷（基础命中 15 + 装备，基础敏捷 8 + 怪物）。 */
    private boolean hitCheck(Player p, Monster m) {
        int hit = 15 + p.combat.hit;
        int dodge = 8 + m.template.speed;
        if (dodge <= 0) {
            return true;
        }
        return Math.random() * (hit + dodge) < hit;
    }

    private void grantExp(Player p, Monster m) {
        int exp = m.template.exp;
        Party party = world.partyOf(p.id);
        if (party != null && party.size() > 1) {
            // 组队共享经验：平分给附近（<=10 格）的队友
            List<Player> nearby = new ArrayList<>();
            for (long id : party.memberIds) {
                Actor a = world.actor(id);
                if (a instanceof Player && a.alive && a.map == p.map && a.distanceTo(p) <= 10) {
                    nearby.add((Player) a);
                }
            }
            int share = exp / Math.max(1, nearby.size());
            for (Player mp : nearby) {
                addExp(mp, share);
            }
            return;
        }
        addExp(p, exp);
    }

    private void addExp(Player p, int exp) {
        p.exp += exp;
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

    // -- guilds / castle siege ------------------------------------------------

    private void createGuild(PlayerSession session, JsonObject msg) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        String name = str(msg, "name");
        if (name == null || name.isBlank()) {
            return;
        }
        Guild g = world.createGuild(name, p.name);
        if (g == null) {
            world.sendSystem(p, "创建行会失败（名字重复或你已在行会）。");
            return;
        }
        world.sendSystem(p, "你创建了行会 " + name + "，并成为会长。");
    }

    private void joinGuild(PlayerSession session, JsonObject msg) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        String name = str(msg, "name");
        if (world.joinGuild(p.name, name)) {
            world.sendSystem(p, "你加入了行会 " + name + "。");
        } else {
            world.sendSystem(p, "加入行会失败（行会不存在或你已在行会）。");
        }
    }

    private void leaveGuild(PlayerSession session) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        if (world.leaveGuild(p.name)) {
            world.sendSystem(p, "你已退出行会。");
        } else {
            world.sendSystem(p, "你不在任何行会中。");
        }
    }

    private void guildInfo(PlayerSession session) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        Guild g = world.guildOf(p.name);
        if (g == null) {
            world.sendSystem(p, "你不在任何行会中。");
            return;
        }
        StringBuilder sb = new StringBuilder();
        sb.append("行会 ").append(g.name).append("（会长 ").append(g.masterName)
                .append("，").append(g.memberCount()).append(" 人）");
        if (g.ownsCastle) {
            sb.append(" [沙巴克城主]");
        }
        world.sendSystem(p, sb.toString());
        world.sendSystem(p, "成员: " + String.join(", ", g.members));
    }

    private void guildChat(PlayerSession session, JsonObject msg) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        Guild g = world.guildOf(p.name);
        if (g == null) {
            return;
        }
        String text = str(msg, "text");
        if (text == null || text.isEmpty()) {
            return;
        }
        JsonObject o = new JsonObject();
        o.addProperty("type", "guildChat");
        o.addProperty("name", p.name);
        o.addProperty("guild", g.name);
        o.addProperty("text", text);
        for (String member : g.members) {
            for (Player mp : world.players()) {
                if (mp.name.equals(member) && mp.session != null) {
                    mp.session.sendText(o.toString());
                }
            }
        }
    }

    private void siege(PlayerSession session, JsonObject msg) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        Guild g = world.guildOf(p.name);
        if (g == null || !g.masterName.equals(p.name)) {
            world.sendSystem(p, "只有会长可以发起攻城。");
            return;
        }
        int dmg = world.attackCastleDoor(p, Math.max(1, p.combat.dcMax));
        if (dmg > 0) {
            world.sendSystem(p, "攻击城门，造成 " + dmg + " 伤害。");
            return;
        }
        if (world.declareSiege(g.name, 300)) {
            world.sendSystem(p, "你的行会开始攻城（5 分钟）！");
        } else {
            world.sendSystem(p, "无法攻城（已有攻城进行中）。");
        }
    }

    private void guildWar(PlayerSession session, JsonObject msg) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        Guild g = world.guildOf(p.name);
        if (g == null || !g.masterName.equals(p.name)) {
            world.sendSystem(p, "只有会长可以宣战。");
            return;
        }
        String target = str(msg, "name");
        if (world.declareGuildWar(g.name, target)) {
            world.sendSystem(p, "你的行会与 " + target + " 宣战。");
        } else {
            world.sendSystem(p, "宣战失败（行会不存在）。");
        }
    }

    private void guildAlly(PlayerSession session, JsonObject msg) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        Guild g = world.guildOf(p.name);
        if (g == null || !g.masterName.equals(p.name)) {
            world.sendSystem(p, "只有会长可以结盟。");
            return;
        }
        String target = str(msg, "name");
        if (world.makeGuildAlly(g.name, target)) {
            world.sendSystem(p, "你的行会与 " + target + " 结盟。");
        } else {
            world.sendSystem(p, "结盟失败（行会不存在）。");
        }
    }

    // -- parties (组队) ----------------------------------------------------------

    private void partyInvite(PlayerSession session, JsonObject msg) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        String targetName = str(msg, "name");
        if (targetName == null || targetName.isEmpty()) {
            return;
        }
        Player target = world.player(targetName);
        if (target == null || !target.alive) {
            world.sendSystem(p, "玩家不在线。");
            return;
        }
        Party party = world.partyOf(p.id);
        if (party != null) {
            if (world.joinParty(target.id, party.leaderId())) {
                world.sendSystem(p, target.name + " 加入了队伍。");
                world.sendSystem(target, "你加入了 " + p.name + " 的队伍。");
            } else {
                world.sendSystem(p, "邀请失败（对方已在队伍中）。");
            }
        } else {
            world.createParty(p.id, target.id);
            world.sendSystem(p, "你和 " + target.name + " 组成了队伍。");
            world.sendSystem(target, "你和 " + p.name + " 组成了队伍。");
        }
    }

    private void partyLeave(PlayerSession session) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        if (world.leaveParty(p.id)) {
            world.sendSystem(p, "你退出了队伍。");
        } else {
            world.sendSystem(p, "你不在队伍中。");
        }
    }

    private void partyChat(PlayerSession session, JsonObject msg) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        Party party = world.partyOf(p.id);
        if (party == null) {
            return;
        }
        String text = str(msg, "text");
        if (text == null || text.isEmpty()) {
            return;
        }
        JsonObject o = new JsonObject();
        o.addProperty("type", "partyChat");
        o.addProperty("name", p.name);
        o.addProperty("text", text);
        for (long id : party.memberIds) {
            Actor a = world.actor(id);
            if (a instanceof Player && ((Player) a).session != null) {
                ((Player) a).session.sendText(o.toString());
            }
        }
    }

    // -- storage (仓库) ----------------------------------------------------------

    private void storageOpen(PlayerSession session) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        JsonObject o = new JsonObject();
        o.addProperty("type", "storage");
        JsonArray arr = new JsonArray();
        for (ItemInstance it : p.storage) {
            ItemTemplate t = world.itemTemplates.get(it.index);
            arr.add(it.toJson(t == null ? "?" : t.name, t == null ? 0 : t.looks));
        }
        o.add("items", arr);
        session.sendText(o.toString());
    }

    private void storageStore(PlayerSession session, JsonObject msg) {
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
        if (p.storage.size() >= 45) {
            world.sendSystem(p, "仓库已满。");
            return;
        }
        p.bag.remove(found);
        p.storage.add(found);
        world.sendSystem(p, "已存入仓库。");
        sendBagUpdate(p);
    }

    private void storageTake(PlayerSession session, JsonObject msg) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        int makeIndex = integer(msg, "makeIndex", -1);
        ItemInstance found = null;
        for (ItemInstance it : p.storage) {
            if (it.makeIndex == makeIndex) {
                found = it;
                break;
            }
        }
        if (found == null) {
            world.sendSystem(p, "物品不存在。");
            return;
        }
        p.storage.remove(found);
        p.bag.add(found);
        world.sendSystem(p, "已取出。");
        sendBagUpdate(p);
    }

    // -- trade (交易) ------------------------------------------------------------

    private static final class TradeSession {
        final Player a;
        final Player b;
        final List<ItemInstance> aItems = new ArrayList<>();
        final List<ItemInstance> bItems = new ArrayList<>();
        long aGold;
        long bGold;
        boolean aConfirm;
        boolean bConfirm;

        TradeSession(Player a, Player b) {
            this.a = a;
            this.b = b;
        }
    }

    private void tradeRequest(PlayerSession session, JsonObject msg) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        String targetName = str(msg, "name");
        Player target = world.player(targetName);
        if (target == null || !target.alive) {
            world.sendSystem(p, "玩家不在线。");
            return;
        }
        tradeRequests.put(target.id, p.id);
        world.sendSystem(p, "已向 " + target.name + " 发起交易请求。");
        world.sendSystem(target, p.name + " 想与你交易。");
    }

    private void tradeAccept(PlayerSession session) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        Long requesterId = tradeRequests.remove(p.id);
        if (requesterId == null) {
            world.sendSystem(p, "没有待接受的交易请求。");
            return;
        }
        Player a = (Player) world.actor(requesterId);
        if (a == null || !a.alive) {
            return;
        }
        TradeSession t = new TradeSession(a, p);
        trades.put(a.id, t);
        trades.put(p.id, t);
        world.sendSystem(a, p.name + " 接受了交易。");
        world.sendSystem(p, "交易开始。");
    }

    private void tradeCancel(PlayerSession session) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        TradeSession t = trades.remove(p.id);
        if (t == null) {
            return;
        }
        // 归还已放入的物品/金币
        for (ItemInstance it : t.aItems) {
            t.a.bag.add(it);
        }
        for (ItemInstance it : t.bItems) {
            t.b.bag.add(it);
        }
        t.a.gold += t.aGold;
        t.b.gold += t.bGold;
        trades.remove(t.a.id);
        trades.remove(t.b.id);
        world.sendSystem(t.a, "交易取消。");
        world.sendSystem(t.b, "交易取消。");
        sendBagUpdate(t.a);
        sendBagUpdate(t.b);
    }

    private void tradeAddItem(PlayerSession session, JsonObject msg) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        TradeSession t = trades.get(p.id);
        if (t == null) {
            world.sendSystem(p, "没有进行中的交易。");
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
        List<ItemInstance> mine = (p == t.a) ? t.aItems : t.bItems;
        mine.add(found);
        p.bag.remove(found);
        Player other = (p == t.a) ? t.b : t.a;
        world.sendSystem(p, "已放入一件物品。");
        world.sendSystem(other, "对方放入了一件物品。");
    }

    private void tradeAddGold(PlayerSession session, JsonObject msg) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        TradeSession t = trades.get(p.id);
        if (t == null) {
            world.sendSystem(p, "没有进行中的交易。");
            return;
        }
        long amount = longVal(msg, "amount", 0);
        if (amount <= 0 || amount > p.gold) {
            world.sendSystem(p, "金币不足。");
            return;
        }
        p.gold -= amount;
        if (p == t.a) {
            t.aGold += amount;
        } else {
            t.bGold += amount;
        }
        world.sendSystem(p, "已放入 " + amount + " 金币。");
    }

    private void tradeConfirm(PlayerSession session) {
        Player p = findBySession(session);
        if (p == null) {
            return;
        }
        TradeSession t = trades.get(p.id);
        if (t == null) {
            return;
        }
        if (p == t.a) {
            t.aConfirm = true;
        } else {
            t.bConfirm = true;
        }
        if (t.aConfirm && t.bConfirm) {
            executeTrade(t);
        } else {
            world.sendSystem(p, "已确认，等待对方确认。");
        }
    }

    private void executeTrade(TradeSession t) {
        for (ItemInstance it : t.aItems) {
            t.b.bag.add(it);
        }
        for (ItemInstance it : t.bItems) {
            t.a.bag.add(it);
        }
        t.a.gold += t.bGold;
        t.b.gold += t.aGold;
        trades.remove(t.a.id);
        trades.remove(t.b.id);
        world.sendSystem(t.a, "交易完成。");
        world.sendSystem(t.b, "交易完成。");
        sendBagUpdate(t.a);
        sendBagUpdate(t.b);
        world.sendStats(t.a, null);
        world.sendStats(t.b, null);
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
        r.storage = new ArrayList<>(p.storage);
        JsonObject sj = new JsonObject();
        for (Map.Entry<Integer, Skill> e : p.skills.entrySet()) {
            JsonObject s = new JsonObject();
            s.addProperty("level", e.getValue().level);
            s.addProperty("train", e.getValue().curTrain);
            sj.add(String.valueOf(e.getKey()), s);
        }
        r.skills = sj.toString();
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