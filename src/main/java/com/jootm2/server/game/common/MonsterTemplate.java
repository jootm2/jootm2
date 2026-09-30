package com.jootm2.server.game.common;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;

/**
 * Monster/creature template, mapped from TMonsterInfo in Grobal2.pas.
 */
public final class MonsterTemplate {

    public static final Gson GSON = new GsonBuilder().create();

    public String name = "";
    public int race;
    public int raceImg;
    public int appr;          // image number
    public int level;
    public int exp;
    public int hp;
    public int mp;
    public int ac;
    public int mac;
    public int dc;
    public int maxDc;
    public int mc;
    public int sc;
    public int speed;
    public int hit;
    public int walkSpeed;
    public int attackSpeed;
    public int coolEye;

    public JsonObject toJson() {
        JsonObject o = new JsonObject();
        o.addProperty("name", name);
        o.addProperty("race", race);
        o.addProperty("appr", appr);
        o.addProperty("level", level);
        o.addProperty("hp", hp);
        o.addProperty("maxDc", maxDc);
        return o;
    }

    public String serialize() {
        return GSON.toJson(this);
    }

    public static MonsterTemplate deserialize(String json) {
        return GSON.fromJson(json, MonsterTemplate.class);
    }
}