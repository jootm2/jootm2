package com.jootm2.server.game.common;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;

/**
 * A concrete item instance held by a character, mapped from TUserItem.
 * {@code index} points into the standard item template table (TStdItem),
 * {@code makeIndex} is a globally-unique id used to reference this instance.
 */
public final class ItemInstance {

    public static final Gson GSON = new GsonBuilder().create();

    public int makeIndex;
    public int index;          // standard item template id
    public int durability;
    public int durabilityMax;
    public int lucky;          // 武器实例幸运值（祝福油提升，0..7）

    public ItemInstance() {
    }

    public ItemInstance(int makeIndex, int index, int durability, int durabilityMax) {
        this.makeIndex = makeIndex;
        this.index = index;
        this.durability = durability;
        this.durabilityMax = durabilityMax;
    }

    public JsonObject toJson(String templateName, int looks) {
        JsonObject o = new JsonObject();
        o.addProperty("makeIndex", makeIndex);
        o.addProperty("index", index);
        o.addProperty("name", templateName);
        o.addProperty("looks", looks);
        o.addProperty("durability", durability);
        o.addProperty("durabilityMax", durabilityMax);
        return o;
    }

    public String serialize() {
        return GSON.toJson(this);
    }

    public static ItemInstance deserialize(String json) {
        return GSON.fromJson(json, ItemInstance.class);
    }
}