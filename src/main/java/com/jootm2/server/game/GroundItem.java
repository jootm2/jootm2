package com.jootm2.server.game;

import com.google.gson.JsonObject;
import com.jootm2.server.game.common.ItemInstance;

/**
 * An item (or gold pile) lying on the ground, produced by monster death or a
 * player drop. Mirrors the map-item objects created by {@code DropItemDown} /
 * {@code DropGoldDown} in ObjBase.pas. Not an {@link Actor}: it does not move or
 * fight, and is picked up by walking onto it and sending {@code pickup}.
 */
public final class GroundItem {

    public final long id;
    public final ItemInstance item;   // null when this is a gold pile
    public final int gold;            // >0 when this is a gold pile
    public final int x;
    public final int y;
    public GameMap map;

    private GroundItem(long id, ItemInstance item, int gold, int x, int y) {
        this.id = id;
        this.item = item;
        this.gold = gold;
        this.x = x;
        this.y = y;
    }

    public static GroundItem ofItem(long id, ItemInstance item, int x, int y) {
        return new GroundItem(id, item, 0, x, y);
    }

    public static GroundItem ofGold(long id, int gold, int x, int y) {
        return new GroundItem(id, null, gold, x, y);
    }

    public boolean isGold() {
        return gold > 0;
    }

    public JsonObject toJson(String itemName, int looks) {
        JsonObject o = new JsonObject();
        o.addProperty("id", id);
        o.addProperty("x", x);
        o.addProperty("y", y);
        if (isGold()) {
            o.addProperty("gold", gold);
            o.addProperty("name", "金币");
            o.addProperty("looks", 0);
        } else {
            o.addProperty("gold", 0);
            o.addProperty("name", itemName);
            o.addProperty("looks", looks);
        }
        return o;
    }
}
