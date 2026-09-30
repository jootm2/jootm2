package com.jootm2.server.game.common;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;

/**
 * Static item template, mapped 1:1 from TStdItem in Grobal2.pas. StdMode is the
 * Mir 2 item category id (0..2 consumables, 5/6 weapons, 10/11 armours,
 * 15 helmet, 19/20/21 necklace, 22/23 rings, 24/26 bracelets, 30 candle,
 * 52 boots, 53 charm, 54 belt, etc.).
 */
public final class ItemTemplate {

    public static final Gson GSON = new GsonBuilder().create();

    public int index;   // standard item table id (std_items.idx)
    public String name = "";
    public int stdMode;
    public int shape;
    public int weight;
    public int aniCount;
    public int specialPwr;
    public int itemDesc;
    public int looks;
    public int duraMax;

    public int acMin;
    public int acMax;
    public int macMin;
    public int macMax;
    public int dcMin;
    public int dcMax;
    public int mcMin;
    public int mcMax;
    public int scMin;
    public int scMax;

    public int need;          // 0 level, 1 DC, 2 MC, 3 SC
    public int needLevel;
    public int price;
    public int stock;
    public int atkSpd;
    public int agility;
    public int accurate;
    public int mgAvoid;
    public int strong;
    public int undead;
    public int hpAdd;
    public int mpAdd;
    public int expAdd;

    public int effType1;
    public int effRate1;
    public int effValue1;
    public int effType2;
    public int effRate2;
    public int effValue2;

    public JsonObject toJson() {
        JsonObject o = new JsonObject();
        o.addProperty("name", name);
        o.addProperty("stdMode", stdMode);
        o.addProperty("shape", shape);
        o.addProperty("weight", weight);
        o.addProperty("looks", looks);
        o.addProperty("duraMax", duraMax);
        o.addProperty("dc", dcMin);   // simplified: min value for the client
        o.addProperty("mc", mcMin);
        o.addProperty("sc", scMin);
        o.addProperty("ac", acMin);
        o.addProperty("mac", macMin);
        o.addProperty("needLevel", needLevel);
        o.addProperty("price", price);
        return o;
    }

    public static ItemTemplate fromJson(String json) {
        return GSON.fromJson(json, ItemTemplate.class);
    }
}