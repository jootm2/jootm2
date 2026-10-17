package com.jootm2.server.game;

import com.google.gson.JsonObject;
import com.jootm2.server.game.common.MonsterTemplate;

/**
 * A live monster instance. Behaviour (wander / aggro / melee) is driven by
 * GameWorld.tick(); the template supplies its base attributes.
 */
public final class Monster extends Actor {

    /** 宠物名字颜色（原版 GetThisCharColor 里 SlaveColors[0..7]，调色板索引，随 SlaveExpLevel 变化）。 */
    public static final int[] SLAVE_COLORS = {255, 254, 147, 154, 229, 168, 180, 252};

    public final MonsterTemplate template;
    public final int spawnX;
    public final int spawnY;

    public GameMap spawnMap;

    public long targetId = -1;
    public long nextMoveAt;
    public long nextAttackAt;
    public boolean pendingRespawn;
    public long respawnAt;

    /** 最近攻击过本怪物的玩家 id（守卫用它判断反击，-1 无）。 */
    public long lastHiterId = -1;

    /** 主人 Player id（召唤物/宠物），-1 表示普通怪物。 */
    public long masterId = -1;

    /** 宠物经验（原版 SlaveExp，宠物杀怪积累，用于升级）。 */
    public int slaveExp = 0;
    /** 宠物等级（原版 SlaveExpLevel，升级增强 DC/MaxHP 并改变名字颜色）。 */
    public int slaveExpLevel = 0;
    /** 宠物召唤等级（原版 SlaveMakeLevel，升级上限 = 2*MakeLevel+1）。 */
    public int slaveMakeLevel = 0;
    /** 宠物升级的攻击加成（原版 ApplySlaveLevelAbilitys 里 WAbil.DC 提升）。 */
    public int slaveDcBonus = 0;
    /** 神兽变身（原版 TElfMonster/TElfWarriorMonster）：true=两足站立吐火（raceImg 55/MA29），false=四足（raceImg 54/MA28）。 */
    public boolean transformed = false;
    /** 变身后持续站立的时间戳（失去目标 60 秒后变回四足，原版 changefacetime）。 */
    public long changeFaceAt = 0;

    /** 重生间隔（毫秒），0 表示用默认 RESPAWN_MS（来自 MonGen 刷怪时间字段）。 */
    public long respawnIntervalMs = 0;

    /** 麻痹持续到的时间戳（ms），0 表示未麻痹（麻痹武器命中后定身）。 */
    public long paralyzedUntil = 0;

    public Monster(long id, MonsterTemplate template, int x, int y) {
        super(id);
        this.template = template;
        this.name = template.name;
        this.race = template.race;
        this.raceImg = template.raceImg;
        this.appr = template.appr;
        this.level = template.level;
        this.hp = template.hp;
        this.maxHp = template.hp;
        this.spawnX = x;
        this.spawnY = y;
        this.x = x;
        this.y = y;
    }

    public int rollAttack() {
        int min = template.dc + slaveDcBonus;
        int max = Math.max(template.dc, template.maxDc) + slaveDcBonus;
        return min + (int) (Math.random() * (max - min + 1));
    }

    /** 宠物名字颜色索引（原版 SlaveColors[SlaveExpLevel]），普通怪返回 -1。 */
    public int nameColorIndex() {
        if (masterId < 0) {
            return -1;
        }
        int lv = slaveExpLevel;
        return (lv >= 0 && lv <= 7) ? SLAVE_COLORS[lv] : -1;
    }

    @Override
    public JsonObject toBriefJson() {
        JsonObject o = super.toBriefJson();
        int nc = nameColorIndex();
        if (nc >= 0) {
            o.addProperty("nameColor", nc);   // 宠物名字颜色随等级（前端按调色板索引取色）
        }
        return o;
    }
}