package com.jootm2.server.game.common;

/**
 * Character/creature combat &amp; vitality attributes, modelled after the
 * TAbility / TNakedAbility records. In the original engine DC/MC/SC/AC/MAC were
 * stored as a packed word of (min | max&lt;&lt;8); here we store min/max as
 * separate ints for clarity while keeping the same semantics.
 */
public final class Ability {

    public int level = 1;

    public int hp;
    public int maxHp;
    public int mp;
    public int maxMp;

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

    public int hit;
    public int speed;

    public long exp;
    public long gold;

    public Ability() {
    }

    public Ability level(int v) { this.level = v; return this; }
    public Ability hp(int v) { this.hp = v; this.maxHp = v; return this; }
    public Ability mp(int v) { this.mp = v; this.maxMp = v; return this; }

    /** Random damage roll inside [dcMin, dcMax]. */
    public int rollDc() { return roll(dcMin, dcMax); }
    public int rollMc() { return roll(mcMin, mcMax); }
    public int rollSc() { return roll(scMin, scMax); }

    private static int roll(int min, int max) {
        if (max <= min) {
            return min;
        }
        return min + (int) (Math.random() * (max - min + 1));
    }
}