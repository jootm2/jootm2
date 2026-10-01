package com.jootm2.server.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.jootm2.server.game.common.Ability;
import com.jootm2.server.game.common.ItemInstance;
import com.jootm2.server.game.common.ItemTemplate;
import com.jootm2.server.game.common.MessageIds;
import com.jootm2.server.game.common.Skill;
import com.jootm2.server.service.PlayerSession;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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

    // 装备特殊 Shape 值（对齐 ObjBase.pas 的常量）
    private static final int SHAPE_PARALYSIS_WEAPON = 23;
    private static final int SHAPE_TELEPORT_RING = 112;
    private static final int SHAPE_REVIVAL_RING = 114;
    private static final int[] SHAPE_MANA_TO_HP = {133, 134, 135};   // 护身（戒指/手镯/项链）
    private static final int[] SHAPE_SUCK_HEALTH = {136, 137, 138};  // 吸血（戒指/手镯/项链）
    // 三职业套装（项链/手镯/戒指）
    private static final int[] PSET_SHAPES = {153, 154, 155};        // 战士
    private static final int[] HSET_SHAPES = {156, 157, 158};        // 法师
    private static final int[] YSET_SHAPES = {159, 160, 161};        // 道士

    public final long accountId;
    public long characterId;
    public int sex;
    public int hair;
    public int job;
    public long gold;
    public int pkPoint;
    public int[] questParams = new int[1000];   // SET [n] task variables（MapQuest 旗标号可达 400+）

    public int homeX;
    public int homeY;
    public String homeMap = "default";

    public final Ability base = new Ability();
    public final Ability combat = new Ability();
    public final List<ItemInstance> bag = new ArrayList<>();
    public final List<ItemInstance> storage = new ArrayList<>();   // 仓库（独立于背包）
    public final ItemInstance[] equipment = new ItemInstance[13];

    // 装备衍生的特殊属性（recompute 时重算，语义对齐 ObjBase.pas 的 RecalcAbilitys）
    public int luck = 0;                  // 幸运值（武器 SpecialPwr 1-10）
    public int suckHealthRate = 0;        // 吸血比例（吸血装备 AniCount 之和，百分数）
    public int manaToHealth = 0;          // 护身：MP 转 HP 的点数
    public boolean paralysisWeapon = false;  // 麻痹武器（Shape=23）
    public boolean revivalRing = false;      // 复活戒指（Shape=114）
    public boolean teleportRing = false;     // 传送戒指（Shape=112）

    /** Learned magics: magicId -> Skill (level + training points). */
    public final Map<Integer, Skill> skills = new LinkedHashMap<>();
    /** magicId -> last-cast timestamp (ms), for cast cooldown. */
    public final Map<Integer, Long> skillCooldown = new LinkedHashMap<>();

    /** 召唤物（宠物）的怪物 id，-1 表示无宠物。 */
    public long summonId = -1;

    /** 隐身术截止时间戳（ms），0 = 未隐身。 */
    public long hideUntil = 0;

    public GameWorld world;
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

    /** 当前装备武器的外观（无武器为 0），用于客户端武器分层渲染。 */
    public int weaponLooks() {
        ItemInstance w = equipment[MessageIds.U_WEAPON];
        if (w == null || world == null) {
            return 0;
        }
        ItemTemplate t = world.itemTemplates.get(w.index);
        return t == null ? 0 : t.looks;
    }

    @Override
    public JsonObject toBriefJson() {
        JsonObject o = super.toBriefJson();
        o.addProperty("sex", sex);
        o.addProperty("hair", hair);
        o.addProperty("job", job);
        o.addProperty("weaponLooks", weaponLooks());
        return o;
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

        // 重置特殊属性
        luck = 0;
        suckHealthRate = 0;
        manaToHealth = 0;
        paralysisWeapon = false;
        revivalRing = false;
        teleportRing = false;
        boolean[] pset = new boolean[3];   // 项链/手镯/戒指
        boolean[] hset = new boolean[3];
        boolean[] yset = new boolean[3];

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

            // 特殊属性（Shape 值）
            if (t.shape == SHAPE_PARALYSIS_WEAPON) {
                paralysisWeapon = true;
            }
            if (t.shape == SHAPE_TELEPORT_RING) {
                teleportRing = true;
            }
            if (t.shape == SHAPE_REVIVAL_RING) {
                revivalRing = true;
            }
            if (contains(SHAPE_MANA_TO_HP, t.shape)) {
                manaToHealth += t.aniCount;
            }
            if (contains(SHAPE_SUCK_HEALTH, t.shape)) {
                suckHealthRate += t.aniCount;
            }
            // 套装标记
            markSet(PSET_SHAPES, pset, t.shape);
            markSet(HSET_SHAPES, hset, t.shape);
            markSet(YSET_SHAPES, yset, t.shape);
        }

        // 幸运：武器模板 specialPwr + 实例 lucky（祝福油提升）
        ItemInstance w = equipment[MessageIds.U_WEAPON];
        if (w != null) {
            ItemTemplate wt = world.itemTemplates.get(w.index);
            int base = (wt != null && wt.specialPwr >= 1 && wt.specialPwr <= 10) ? wt.specialPwr : 0;
            luck = Math.min(10, base + w.lucky);
        }

        // 套装加成（手镯+戒指 为基础，项链为加成）
        if (pset[1] && pset[2]) {
            combat.hit += 1;                       // HitSpeed +1
            if (pset[0]) { combat.dcMin += 1; combat.dcMax += 3; }
        }
        if (hset[1] && hset[2]) {
            if (hset[0]) { combat.mcMin += 1; combat.mcMax += 2; }
        }
        if (yset[1] && yset[2]) {
            if (yset[0]) { combat.scMin += 1; combat.scMax += 2; }
        }

        maxHp = BASE_HP[job] + hpAdd + (level - 1) * HP_GROWTH;
        maxMp = BASE_MP[job] + mpAdd + (level - 1) * MP_GROWTH;
        hp = Math.max(0, Math.min(hp, maxHp));
        mp = Math.max(0, Math.min(mp, maxMp));
    }

    private static boolean contains(int[] arr, int v) {
        for (int x : arr) {
            if (x == v) {
                return true;
            }
        }
        return false;
    }

    private static void markSet(int[] shapes, boolean[] set, int shape) {
        for (int i = 0; i < shapes.length; i++) {
            if (shapes[i] == shape) {
                set[i] = true;
            }
        }
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