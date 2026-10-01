package com.jootm2.server.game;

import com.jootm2.server.game.common.MonsterTemplate;

/**
 * A live monster instance. Behaviour (wander / aggro / melee) is driven by
 * GameWorld.tick(); the template supplies its base attributes.
 */
public final class Monster extends Actor {

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
        int min = template.dc;
        int max = Math.max(template.dc, template.maxDc);
        return min + (int) (Math.random() * (max - min + 1));
    }
}