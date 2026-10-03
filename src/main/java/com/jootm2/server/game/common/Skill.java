package com.jootm2.server.game.common;

/**
 * A learned magic on a player: the current skill level (0..3) and the training
 * points accumulated towards the next level.
 */
public final class Skill {
    public int level;     // 0..3（对应 NeedL1..NeedL3 / MaxTrainLevel=3）
    public int curTrain;  // 当前熟练度（达到 MaxTrain[lv] 后升级）
    public int key;       // 快捷键 0=无, 1..8=F1..F8

    public Skill() {
    }

    public Skill(int level) {
        this.level = level;
        this.curTrain = 0;
        this.key = 0;
    }
}
