package com.jootm2.server.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.jootm2.server.game.common.Ability;
import com.jootm2.server.game.common.ItemInstance;
import com.jootm2.server.game.common.ItemTemplate;
import com.jootm2.server.game.common.MessageIds;
import com.jootm2.server.service.PlayerSession;

import java.util.ArrayList;
import java.util.List;

/**
 * A logged-in or persisted human character. Combines the Delphi THuman/PlayerObject
 * state with the account link introduced by the rewrite.
 */
public final class Player extends Actor {

    // Base vitality per job (0 warrior, 1 wizard, 2 taoist).
    private static final int[] BASE_HP = {26, 16, 18};
    private static final int[] BASE_MP = {12, 20, 16};
    private static final int[] BASE_DC = {2, 0, 1};
    private static final int[] BASE_MC = {0, 2, 0};
    private static final int[] BASE_SC = {0, 0, 2};
    private static final int HP_GROWTH = 3;
    private static final int MP_GROWTH = 2;

    public final long accountId;
    public long characterId;
    public int sex;
    public int hair;
    public int job;
    public long gold;
    public int pkPoint;
    public int[] questParams = new int[100];   // SET [n] task variables

    public int homeX;
    public int homeY;
    public String homeMap = "default";

    public final Ability base = new Ability();
    public final Ability combat = new Ability();
    public final List<ItemInstance> bag = new ArrayList<>();
    public final ItemInstance[] equipment = new ItemInstance[13];

    public PlayerSession session;

    public Player(long id, long accountId) {
        super(id);
        this.accountId = accountId;
        this.race = MessageIds.RC_USERHUMAN;
    }

    @Override
    public boolean isPlayer() {
        return true;
    }

    /** Re-derives maxHp/maxMp and the effective combat ability from job/level/gear. */
    public void recompute(GameWorld world) {
        combat.dcMin = BASE_DC[job];
        combat.dcMax = BASE_DC[job];
        combat.mcMin = BASE_MC[job];
        combat.mcMax = BASE_MC[job];
        combat.scMin = BASE_SC[job];
        combat.scMax = BASE_SC[job];
        combat.acMin = 0;
        combat.acMax = 0;
        combat.macMin = 0;
        combat.macMax = 0;

        int hpAdd = 0;
        int mpAdd = 0;
        for (ItemInstance it : equipment) {
            if (it == null) {
                continue;
            }
            ItemTemplate t = world.itemTemplates.get(it.index);
            if (t == null) {
                continue;
            }
            combat.dcMin += t.dcMin;
            combat.dcMax += t.dcMax;
            combat.mcMin += t.mcMin;
            combat.mcMax += t.mcMax;
            combat.scMin += t.scMin;
            combat.scMax += t.scMax;
            combat.acMin += t.acMin;
            combat.acMax += t.acMax;
            combat.macMin += t.macMin;
            combat.macMax += t.macMax;
            hpAdd += t.hpAdd;
            mpAdd += t.mpAdd;
        }

        maxHp = BASE_HP[job] + hpAdd + (level - 1) * HP_GROWTH;
        maxMp = BASE_MP[job] + mpAdd + (level - 1) * MP_GROWTH;
        hp = Math.max(0, Math.min(hp, maxHp));
        mp = Math.max(0, Math.min(mp, maxMp));
    }

    /** Splits persisted items into equipment slots vs the bag based on stdMode. */
    public void distributeItems(GameWorld world) {
        List<ItemInstance> remain = new ArrayList<>();
        for (ItemInstance it : bag) {
            ItemTemplate t = world.itemTemplates.get(it.index);
            int slot = t == null ? -1 : slotFor(t);
            if (slot >= 0 && equipment[slot] == null) {
                equipment[slot] = it;
            } else {
                remain.add(it);
            }
        }
        bag.clear();
        bag.addAll(remain);
    }

    /** Maps a stdMode to an equipment slot, or -1 for non-equippable items. */
    public static int slotFor(ItemTemplate t) {
        switch (t.stdMode) {
            case 5:
            case 6:
                return MessageIds.U_WEAPON;
            case 10:
            case 11:
                return MessageIds.U_DRESS;
            case 15:
                return MessageIds.U_HELMET;
            case 19:
            case 20:
            case 21:
                return MessageIds.U_NECKLACE;
            case 24:
            case 26:
                return MessageIds.U_ARMRINGL;
            case 22:
            case 23:
                return MessageIds.U_RINGL;
            case 52:
                return MessageIds.U_BOOTS;
            case 54:
                return MessageIds.U_BELT;
            case 53:
                return MessageIds.U_CHARM;
            default:
                return -1;
        }
    }

    public JsonObject toPlayerJson(GameWorld world) {
        JsonObject o = new JsonObject();
        o.addProperty("id", id);
        o.addProperty("name", name);
        o.addProperty("type", "player");
        o.addProperty("sex", sex);
        o.addProperty("hair", hair);
        o.addProperty("job", job);
        o.addProperty("level", level);
        o.addProperty("exp", exp);
        o.addProperty("x", x);
        o.addProperty("y", y);
        o.addProperty("dir", dir);
        o.addProperty("hp", hp);
        o.addProperty("maxHp", maxHp);
        o.addProperty("mp", mp);
        o.addProperty("maxMp", maxMp);
        o.addProperty("gold", gold);
        o.addProperty("race", race);
        o.addProperty("appr", appr);
        o.add("items", itemsJson(world));
        return o;
    }

    public JsonArray itemsJson(GameWorld world) {
        JsonArray arr = new JsonArray();
        for (ItemInstance it : bag) {
            arr.add(instanceJson(world, it));
        }
        for (int slot = 0; slot < equipment.length; slot++) {
            ItemInstance it = equipment[slot];
            if (it != null) {
                JsonObject e = instanceJson(world, it);
                e.addProperty("slot", slot);
                arr.add(e);
            }
        }
        return arr;
    }

    private JsonObject instanceJson(GameWorld world, ItemInstance it) {
        ItemTemplate t = world.itemTemplates.get(it.index);
        return it.toJson(t == null ? "?" : t.name, t == null ? 0 : t.looks);
    }
}