package com.jootm2.server.game.common;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;

/**
 * A magic/skill definition imported from mud2/DB/Magic.csv.
 *
 * The authoritative field layout lives in the Delphi source
 * (M2Server/LocalDB.pas {@code LoadMagic}); the CSV columns after MagId/MagName
 * are kept in {@link #attrs} in the exact column order and mapped to named
 * fields by {@link #resolve()}.
 *
 * Column order (after MagId, MagName) is:
 * EffectType, Effect, Spell(MP cost), Power(min), MaxPower,
 * DefSpell, DefPower(min), DefMaxPower, Job,
 * NeedL1, L1Train, NeedL2, L2Train, NeedL3, L3Train, Delay, Descr.
 */
public final class MagicTemplate {

    public static final Gson GSON = new GsonBuilder().create();

    public int magId;
    public String name = "";
    public JsonArray attrs = new JsonArray();

    // Named fields resolved from attrs (see resolve()).
    public int effectType;
    public int effect;      // 施法动画特效 id
    public int spell;       // 施法消耗 MP
    public int power;       // 基础最小威力
    public int maxPower;    // 基础最大威力
    public int job;         // 职业：0 战士 / 1 法师 / 2 道士
    public int[] needLevel = new int[3];   // 每级所需玩家等级
    public int[] maxTrain = new int[3];    // 每级所需熟练度
    public int delay;       // 冷却时间（毫秒，源字段 ×10）
    public int defSpell;    // 防御魔法加成
    public int defPower;    // 防御最小威力加成
    public int defMaxPower; // 防御最大威力加成

    public String serialize() {
        return GSON.toJson(this);
    }

    public static MagicTemplate deserialize(String json) {
        return GSON.fromJson(json, MagicTemplate.class);
    }

    /** Maps the raw ordered attrs onto the named fields (idempotent). */
    public void resolve() {
        effectType = intAt(0);
        effect = intAt(1);
        spell = intAt(2);
        power = intAt(3);
        maxPower = intAt(4);
        defSpell = intAt(5);
        defPower = intAt(6);
        defMaxPower = intAt(7);
        job = intAt(8);
        needLevel[0] = intAt(9);
        maxTrain[0] = intAt(10);
        needLevel[1] = intAt(11);
        maxTrain[1] = intAt(12);
        needLevel[2] = intAt(13);
        maxTrain[2] = intAt(14);
        delay = intAt(15) * 10;   // DelayTime := Delay * 10
    }

    private int intAt(int i) {
        if (i < 0 || i >= attrs.size()) {
            return 0;
        }
        JsonElement e = attrs.get(i);
        if (e != null && e.isJsonPrimitive()) {
            try {
                return e.getAsInt();
            } catch (NumberFormatException ignored) {
            }
        }
        return 0;
    }
}
