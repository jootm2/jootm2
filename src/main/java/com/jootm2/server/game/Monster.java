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