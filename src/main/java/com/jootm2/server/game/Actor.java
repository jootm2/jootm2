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
    public int hp;
    public int maxHp;
    public int mp;
    public int maxMp;
    public int level = 1;
    public long exp;
    public int race;   // MessageIds.RC_*
    public int appr;   // image index used for rendering
    public boolean alive = true;
    public GameMap map;

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
        o.addProperty("appr", appr);
        o.addProperty("level", level);
        return o;
    }

    public int distanceTo(Actor other) {
        return Math.max(Math.abs(x - other.x), Math.abs(y - other.y));
    }
}