package com.jootm2.server.game;

import com.google.gson.JsonObject;

/**
 * Base for players and monsters. Every live creature has a unique runtime id,
 * a position on a {@link GameMap} and the shared vitality fields the client
 * needs to render it.
 */
public class Actor {

    public final long id;
    public String name;
    public int x;
    public int y;
    public int dir;
    public boolean running;   // 移动动作类型：走(walk)/跑(run)，广播给客户端播放对应动画
    public int hp;
    public int maxHp;
    public int mp;
    public int maxMp;
    public int level = 1;
    public long exp;
    public int race;   // MessageIds.RC_*
    public int raceImg;   // image race id (maps to monN sprite library)
    public int appr;   // image index used for rendering
    public boolean alive = true;
    public GameMap map;

    // 红毒（施毒术 POISON_DECHEALTH，持续掉血）：poisonTicks 剩余跳数（每 POISON_INTERVAL_MS 一跳），0 未中毒
    public int poisonTicks;
    public int poisonDamage;     // 每跳伤害（原版 1 + PoisonLevel）
    public long lastPoisonAt;
    // 绿毒（施毒术 POISON_DAMAGEARMOR，减防）：截止时间戳，0 = 无绿毒，期间受伤 +20%（原版 StruckDamage）
    public long poisonArmorUntil = 0;

    protected Actor(long id) {
        this.id = id;
    }

    public boolean isPlayer() {
        return false;
    }

    /** Small entity snapshot used for broadcasts (add/update). */
    public JsonObject toBriefJson() {
        JsonObject o = new JsonObject();
        o.addProperty("id", id);
        o.addProperty("name", name);
        o.addProperty("type", isPlayer() ? "player" : "monster");
        o.addProperty("x", x);
        o.addProperty("y", y);
        o.addProperty("dir", dir);
        o.addProperty("hp", hp);
        o.addProperty("maxHp", maxHp);
        o.addProperty("race", race);
        o.addProperty("raceImg", raceImg);
        o.addProperty("appr", appr);
        o.addProperty("level", level);
        return o;
    }

    public int distanceTo(Actor other) {
        return Math.max(Math.abs(x - other.x), Math.abs(y - other.y));
    }
}