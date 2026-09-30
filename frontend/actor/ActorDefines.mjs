// ===================== 全局常量 =====================
const MAXACTORSOUND = 3;
const CMMX = 150;
const CMMY = 200;

const HUMANFRAME = 600;
const MONFRAME = 280;
const EXPMONFRAME = 360;
const SCULMONFRAME = 440;
const ZOMBIFRAME = 430;
const MERCHANTFRAME = 60;
const MAXSAY = 5;

const RUN_MINHEALTH = 10;
const DEFSPELLFRAME = 10;
const FIREHIT_READYFRAME = 6;  // 炎火诀施法帧
const MAGBUBBLEBASE = 3890;
const MAGBUBBLESTRUCKBASE = 3900;
const MAXWPEFFECTFRAME = 5;
const WPEFFECTBASE = 3750;
const EFFECTBASE = 0;

// 单组动作字段说明：
// start   - 起始帧序号
// frame   - 有效帧数
// skip    - 帧间隔跳过数
// ftime   - 单帧持续时间(毫秒)
// usetick - 移动刻度值，仅移动类动作生效

const HA = {
    ActStand: { start: 0, frame: 4, skip: 4, ftime: 200, usetick: 0 }, // 站立
    ActWalk: { start: 64, frame: 6, skip: 2, ftime: 90, usetick: 2 }, // 行走
    ActRun: { start: 128, frame: 6, skip: 2, ftime: 120, usetick: 3 }, // 奔跑
    ActRushLeft: { start: 128, frame: 3, skip: 5, ftime: 120, usetick: 3 }, // 左冲锋
    ActRushRight: { start: 131, frame: 3, skip: 5, ftime: 120, usetick: 3 }, // 右冲锋
    ActWarMode: { start: 192, frame: 1, skip: 0, ftime: 200, usetick: 0 }, // 战斗姿态
    ActHit: { start: 200, frame: 6, skip: 2, ftime: 85, usetick: 0 }, // 普通攻击
    ActHeavyHit: { start: 264, frame: 6, skip: 2, ftime: 90, usetick: 0 }, // 重击
    ActBigHit: { start: 328, frame: 8, skip: 0, ftime: 70, usetick: 0 }, // 强击
    ActFireHitReady: { start: 192, frame: 6, skip: 4, ftime: 70, usetick: 0 }, // 炎火诀蓄力
    ActSpell: { start: 392, frame: 6, skip: 2, ftime: 60, usetick: 0 }, // 施法
    ActSitdown: { start: 456, frame: 2, skip: 0, ftime: 300, usetick: 0 }, // 坐下
    ActStruck: { start: 472, frame: 3, skip: 5, ftime: 70, usetick: 0 }, // 受击
    ActDie: { start: 536, frame: 4, skip: 4, ftime: 120, usetick: 0 }  // 死亡
};

// MA9 - 足球
const MA9 = {
    ActStand: { start: 0, frame: 1, skip: 7, ftime: 200, usetick: 0 },
    ActWalk: { start: 64, frame: 6, skip: 2, ftime: 120, usetick: 3 },
    ActAttack: { start: 64, frame: 6, skip: 2, ftime: 150, usetick: 0 },
    ActCritical: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActStruck: { start: 64, frame: 6, skip: 2, ftime: 100, usetick: 0 },
    ActDie: { start: 0, frame: 1, skip: 7, ftime: 140, usetick: 0 },
    ActDeath: { start: 0, frame: 1, skip: 7, ftime: 0, usetick: 0 }
};

// MA10 - 鸡、毛团（8帧版）
const MA10 = {
    ActStand: { start: 0, frame: 4, skip: 4, ftime: 200, usetick: 0 },
    ActWalk: { start: 64, frame: 6, skip: 2, ftime: 120, usetick: 3 },
    ActAttack: { start: 128, frame: 4, skip: 4, ftime: 150, usetick: 0 },
    ActCritical: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActStruck: { start: 192, frame: 2, skip: 0, ftime: 100, usetick: 0 },
    ActDie: { start: 208, frame: 4, skip: 4, ftime: 140, usetick: 0 },
    ActDeath: { start: 272, frame: 1, skip: 0, ftime: 0, usetick: 0 }
};

// MA11 - 鹿（10帧版）
const MA11 = {
    ActStand: { start: 0, frame: 4, skip: 6, ftime: 200, usetick: 0 },
    ActWalk: { start: 80, frame: 6, skip: 4, ftime: 120, usetick: 3 },
    ActAttack: { start: 160, frame: 6, skip: 4, ftime: 100, usetick: 0 },
    ActCritical: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActStruck: { start: 240, frame: 2, skip: 0, ftime: 100, usetick: 0 },
    ActDie: { start: 260, frame: 10, skip: 0, ftime: 140, usetick: 0 },
    ActDeath: { start: 340, frame: 1, skip: 0, ftime: 0, usetick: 0 }
};

// MA12 - 卫兵（攻击速度快）
const MA12 = {
    ActStand: { start: 0, frame: 4, skip: 4, ftime: 200, usetick: 0 },
    ActWalk: { start: 64, frame: 6, skip: 2, ftime: 120, usetick: 3 },
    ActAttack: { start: 128, frame: 6, skip: 2, ftime: 150, usetick: 0 },
    ActCritical: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActStruck: { start: 192, frame: 2, skip: 0, ftime: 150, usetick: 0 },
    ActDie: { start: 208, frame: 4, skip: 4, ftime: 160, usetick: 0 },
    ActDeath: { start: 272, frame: 1, skip: 0, ftime: 0, usetick: 0 }
};

// MA13 - 食人草
const MA13 = {
    ActStand: { start: 0, frame: 4, skip: 6, ftime: 200, usetick: 0 },
    ActWalk: { start: 10, frame: 8, skip: 2, ftime: 160, usetick: 0 }, // 登场动画
    ActAttack: { start: 30, frame: 6, skip: 4, ftime: 120, usetick: 0 },
    ActCritical: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActStruck: { start: 110, frame: 2, skip: 0, ftime: 100, usetick: 0 },
    ActDie: { start: 130, frame: 10, skip: 0, ftime: 120, usetick: 0 },
    ActDeath: { start: 20, frame: 9, skip: 0, ftime: 150, usetick: 0 }  // 隐匿动画
};

// MA14 - 骷髅巨魔
const MA14 = {
    ActStand: { start: 0, frame: 4, skip: 6, ftime: 200, usetick: 0 },
    ActWalk: { start: 80, frame: 6, skip: 4, ftime: 160, usetick: 3 },
    ActAttack: { start: 160, frame: 6, skip: 4, ftime: 100, usetick: 0 },
    ActCritical: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActStruck: { start: 240, frame: 2, skip: 0, ftime: 100, usetick: 0 },
    ActDie: { start: 260, frame: 10, skip: 0, ftime: 120, usetick: 0 },
    ActDeath: { start: 340, frame: 10, skip: 0, ftime: 100, usetick: 0 }  // 白骨召唤形态
};

// MA15 - 扔斧巨魔
const MA15 = {
    ActStand: { start: 0, frame: 4, skip: 6, ftime: 200, usetick: 0 },
    ActWalk: { start: 80, frame: 6, skip: 4, ftime: 160, usetick: 3 },
    ActAttack: { start: 160, frame: 6, skip: 4, ftime: 100, usetick: 0 },
    ActCritical: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActStruck: { start: 240, frame: 2, skip: 0, ftime: 100, usetick: 0 },
    ActDie: { start: 260, frame: 10, skip: 0, ftime: 120, usetick: 0 },
    ActDeath: { start: 1, frame: 1, skip: 0, ftime: 100, usetick: 0 }
};

// MA16 - 喷毒泥怪
const MA16 = {
    ActStand: { start: 0, frame: 4, skip: 6, ftime: 200, usetick: 0 },
    ActWalk: { start: 80, frame: 6, skip: 4, ftime: 160, usetick: 3 },
    ActAttack: { start: 160, frame: 6, skip: 4, ftime: 160, usetick: 0 },
    ActCritical: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActStruck: { start: 240, frame: 2, skip: 0, ftime: 100, usetick: 0 },
    ActDie: { start: 260, frame: 4, skip: 6, ftime: 160, usetick: 0 },
    ActDeath: { start: 0, frame: 1, skip: 0, ftime: 160, usetick: 0 }
};

// MA17 - 蹦跳怪
const MA17 = {
    ActStand: { start: 0, frame: 4, skip: 6, ftime: 60, usetick: 0 },
    ActWalk: { start: 80, frame: 6, skip: 4, ftime: 160, usetick: 3 },
    ActAttack: { start: 160, frame: 6, skip: 4, ftime: 100, usetick: 0 },
    ActCritical: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActStruck: { start: 240, frame: 2, skip: 0, ftime: 100, usetick: 0 },
    ActDie: { start: 260, frame: 10, skip: 0, ftime: 100, usetick: 0 },
    ActDeath: { start: 340, frame: 1, skip: 0, ftime: 140, usetick: 0 }
};

// MA19 - 牛面鬼（死亡动画快）
const MA19 = {
    ActStand: { start: 0, frame: 4, skip: 6, ftime: 200, usetick: 0 },
    ActWalk: { start: 80, frame: 6, skip: 4, ftime: 160, usetick: 3 },
    ActAttack: { start: 160, frame: 6, skip: 4, ftime: 100, usetick: 0 },
    ActCritical: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActStruck: { start: 240, frame: 2, skip: 0, ftime: 100, usetick: 0 },
    ActDie: { start: 260, frame: 10, skip: 0, ftime: 140, usetick: 0 },
    ActDeath: { start: 340, frame: 1, skip: 0, ftime: 140, usetick: 0 }
};

// MA20 - 复活僵尸
const MA20 = {
    ActStand: { start: 0, frame: 4, skip: 6, ftime: 200, usetick: 0 },
    ActWalk: { start: 80, frame: 6, skip: 4, ftime: 160, usetick: 3 },
    ActAttack: { start: 160, frame: 6, skip: 4, ftime: 120, usetick: 0 },
    ActCritical: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActStruck: { start: 240, frame: 2, skip: 0, ftime: 100, usetick: 0 },
    ActDie: { start: 260, frame: 10, skip: 0, ftime: 100, usetick: 0 },
    ActDeath: { start: 340, frame: 10, skip: 0, ftime: 170, usetick: 0 }  // 复活动画
};

// MA21 - 蜂巢
const MA21 = {
    ActStand: { start: 0, frame: 4, skip: 6, ftime: 200, usetick: 0 },
    ActWalk: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActAttack: { start: 10, frame: 6, skip: 4, ftime: 120, usetick: 0 }, // 发射蜜蜂
    ActCritical: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActStruck: { start: 20, frame: 2, skip: 0, ftime: 100, usetick: 0 },
    ActDie: { start: 30, frame: 10, skip: 0, ftime: 160, usetick: 0 },
    ActDeath: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 }
};

// MA22 - 石像怪（山羊队长、山羊将军）
const MA22 = {
    ActStand: { start: 80, frame: 4, skip: 6, ftime: 200, usetick: 0 },
    ActWalk: { start: 160, frame: 6, skip: 4, ftime: 160, usetick: 3 },
    ActAttack: { start: 240, frame: 6, skip: 4, ftime: 100, usetick: 0 },
    ActCritical: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActStruck: { start: 320, frame: 2, skip: 0, ftime: 100, usetick: 0 },
    ActDie: { start: 340, frame: 10, skip: 0, ftime: 160, usetick: 0 },
    ActDeath: { start: 0, frame: 6, skip: 4, ftime: 170, usetick: 0 }  // 石像苏醒
};

// MA23 - 蛛魔王
const MA23 = {
    ActStand: { start: 20, frame: 4, skip: 6, ftime: 200, usetick: 0 },
    ActWalk: { start: 100, frame: 6, skip: 4, ftime: 160, usetick: 3 },
    ActAttack: { start: 180, frame: 6, skip: 4, ftime: 100, usetick: 0 },
    ActCritical: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActStruck: { start: 260, frame: 2, skip: 0, ftime: 100, usetick: 0 },
    ActDie: { start: 280, frame: 10, skip: 0, ftime: 160, usetick: 0 },
    ActDeath: { start: 0, frame: 20, skip: 0, ftime: 100, usetick: 0 }  // 石像苏醒
};

// MA24 - 蝎子（两种攻击方式）
const MA24 = {
    ActStand: { start: 0, frame: 4, skip: 6, ftime: 200, usetick: 0 },
    ActWalk: { start: 80, frame: 6, skip: 4, ftime: 160, usetick: 3 },
    ActAttack: { start: 160, frame: 6, skip: 4, ftime: 100, usetick: 0 },
    ActCritical: { start: 240, frame: 6, skip: 4, ftime: 100, usetick: 0 },
    ActStruck: { start: 320, frame: 2, skip: 0, ftime: 100, usetick: 0 },
    ActDie: { start: 340, frame: 10, skip: 0, ftime: 140, usetick: 0 },
    ActDeath: { start: 420, frame: 1, skip: 0, ftime: 140, usetick: 0 }
};

// MA25 - 蜈蚣王
const MA25 = {
    ActStand: { start: 0, frame: 4, skip: 6, ftime: 200, usetick: 0 },
    ActWalk: { start: 70, frame: 10, skip: 0, ftime: 200, usetick: 3 }, // 登场
    ActAttack: { start: 20, frame: 6, skip: 4, ftime: 120, usetick: 0 }, // 近战攻击
    ActCritical: { start: 10, frame: 6, skip: 4, ftime: 120, usetick: 0 }, // 毒刺远程攻击
    ActStruck: { start: 50, frame: 2, skip: 0, ftime: 100, usetick: 0 },
    ActDie: { start: 60, frame: 10, skip: 0, ftime: 200, usetick: 0 },
    ActDeath: { start: 80, frame: 10, skip: 0, ftime: 200, usetick: 3 }
};

// MA26 - 城门
const MA26 = {
    ActStand: { start: 0, frame: 1, skip: 7, ftime: 200, usetick: 0 },
    ActWalk: { start: 0, frame: 0, skip: 0, ftime: 160, usetick: 0 }, // 登场
    ActAttack: { start: 56, frame: 6, skip: 2, ftime: 500, usetick: 0 }, // 开门
    ActCritical: { start: 64, frame: 6, skip: 2, ftime: 500, usetick: 0 }, // 关门
    ActStruck: { start: 0, frame: 4, skip: 4, ftime: 100, usetick: 0 },
    ActDie: { start: 24, frame: 10, skip: 0, ftime: 120, usetick: 0 },
    ActDeath: { start: 0, frame: 0, skip: 0, ftime: 150, usetick: 0 }  // 隐匿
};

// MA27 - 城墙
const MA27 = {
    ActStand: { start: 0, frame: 1, skip: 7, ftime: 200, usetick: 0 },
    ActWalk: { start: 0, frame: 0, skip: 0, ftime: 160, usetick: 0 }, // 登场
    ActAttack: { start: 0, frame: 0, skip: 0, ftime: 250, usetick: 0 },
    ActCritical: { start: 0, frame: 0, skip: 0, ftime: 250, usetick: 0 },
    ActStruck: { start: 0, frame: 0, skip: 0, ftime: 100, usetick: 0 },
    ActDie: { start: 0, frame: 10, skip: 0, ftime: 120, usetick: 0 },
    ActDeath: { start: 0, frame: 0, skip: 0, ftime: 150, usetick: 0 }  // 隐匿
};

// MA28 - 神兽（变身前）
const MA28 = {
    ActStand: { start: 80, frame: 4, skip: 6, ftime: 200, usetick: 0 },
    ActWalk: { start: 160, frame: 6, skip: 4, ftime: 160, usetick: 3 },
    ActAttack: { start: 0, frame: 6, skip: 4, ftime: 100, usetick: 0 },
    ActCritical: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActStruck: { start: 240, frame: 2, skip: 0, ftime: 100, usetick: 0 },
    ActDie: { start: 260, frame: 10, skip: 0, ftime: 120, usetick: 0 },
    ActDeath: { start: 0, frame: 10, skip: 0, ftime: 100, usetick: 0 }  // 登场
};

// MA29 - 神兽（变身后）
const MA29 = {
    ActStand: { start: 80, frame: 4, skip: 6, ftime: 200, usetick: 0 },
    ActWalk: { start: 160, frame: 6, skip: 4, ftime: 160, usetick: 3 },
    ActAttack: { start: 240, frame: 6, skip: 4, ftime: 100, usetick: 0 },
    ActCritical: { start: 0, frame: 10, skip: 0, ftime: 100, usetick: 0 },
    ActStruck: { start: 320, frame: 2, skip: 0, ftime: 100, usetick: 0 },
    ActDie: { start: 340, frame: 10, skip: 0, ftime: 120, usetick: 0 },
    ActDeath: { start: 0, frame: 10, skip: 0, ftime: 100, usetick: 0 }  // 登场
};

// MA30 - 血巨人王、心脏、赤月魔
const MA30 = {
    ActStand: { start: 0, frame: 4, skip: 6, ftime: 200, usetick: 0 },
    ActWalk: { start: 0, frame: 10, skip: 0, ftime: 200, usetick: 3 },
    ActAttack: { start: 10, frame: 6, skip: 4, ftime: 120, usetick: 0 }, // 攻击姿态
    ActCritical: { start: 10, frame: 6, skip: 4, ftime: 120, usetick: 0 },
    ActStruck: { start: 20, frame: 2, skip: 0, ftime: 100, usetick: 0 },
    ActDie: { start: 30, frame: 20, skip: 0, ftime: 150, usetick: 0 },
    ActDeath: { start: 0, frame: 10, skip: 0, ftime: 200, usetick: 3 }
};

// MA31 - 爆眼蜘蛛
const MA31 = {
    ActStand: { start: 0, frame: 4, skip: 6, ftime: 200, usetick: 0 },
    ActWalk: { start: 0, frame: 10, skip: 0, ftime: 200, usetick: 3 },
    ActAttack: { start: 10, frame: 6, skip: 4, ftime: 120, usetick: 0 }, // 攻击姿态
    ActCritical: { start: 0, frame: 6, skip: 4, ftime: 120, usetick: 0 },
    ActStruck: { start: 0, frame: 2, skip: 8, ftime: 100, usetick: 0 },
    ActDie: { start: 20, frame: 10, skip: 0, ftime: 200, usetick: 0 },
    ActDeath: { start: 0, frame: 10, skip: 0, ftime: 200, usetick: 3 }
};

// MA32 - 暴走
const MA32 = {
    ActStand: { start: 0, frame: 1, skip: 9, ftime: 200, usetick: 0 },
    ActWalk: { start: 0, frame: 6, skip: 4, ftime: 200, usetick: 3 },
    ActAttack: { start: 0, frame: 6, skip: 4, ftime: 120, usetick: 0 }, // 攻击姿态
    ActCritical: { start: 0, frame: 6, skip: 4, ftime: 120, usetick: 0 },
    ActStruck: { start: 0, frame: 2, skip: 8, ftime: 100, usetick: 0 },
    ActDie: { start: 80, frame: 10, skip: 0, ftime: 80, usetick: 0 },
    ActDeath: { start: 80, frame: 10, skip: 0, ftime: 200, usetick: 3 }
};

// MA33 - 雷血士、王中王（蛛魔本王）、王盾
const MA33 = {
    ActStand: { start: 0, frame: 4, skip: 6, ftime: 200, usetick: 0 },
    ActWalk: { start: 80, frame: 6, skip: 4, ftime: 200, usetick: 3 },
    ActAttack: { start: 160, frame: 6, skip: 4, ftime: 120, usetick: 0 }, // 攻击姿态
    ActCritical: { start: 340, frame: 6, skip: 4, ftime: 120, usetick: 0 },
    ActStruck: { start: 240, frame: 2, skip: 0, ftime: 100, usetick: 0 },
    ActDie: { start: 260, frame: 10, skip: 0, ftime: 200, usetick: 0 },
    ActDeath: { start: 260, frame: 10, skip: 0, ftime: 200, usetick: 0 }
};

// MA34 - 骷髅法王
const MA34 = {
    ActStand: { start: 0, frame: 4, skip: 6, ftime: 200, usetick: 0 },
    ActWalk: { start: 80, frame: 6, skip: 4, ftime: 200, usetick: 3 },
    ActAttack: { start: 160, frame: 6, skip: 4, ftime: 120, usetick: 0 }, // 攻击姿态
    ActCritical: { start: 320, frame: 6, skip: 4, ftime: 120, usetick: 0 },
    ActStruck: { start: 400, frame: 2, skip: 0, ftime: 100, usetick: 0 },
    ActDie: { start: 420, frame: 20, skip: 0, ftime: 200, usetick: 0 },
    ActDeath: { start: 420, frame: 20, skip: 0, ftime: 200, usetick: 0 }
};

// MA50 - NPC基础
const MA50 = {
    ActStand: { start: 0, frame: 4, skip: 6, ftime: 200, usetick: 0 },
    ActWalk: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActAttack: { start: 30, frame: 10, skip: 0, ftime: 150, usetick: 0 },
    ActCritical: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActStruck: { start: 0, frame: 1, skip: 9, ftime: 0, usetick: 0 },
    ActDie: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActDeath: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 }
};

// MA51
const MA51 = {
    ActStand: { start: 0, frame: 4, skip: 6, ftime: 200, usetick: 0 },
    ActWalk: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActAttack: { start: 30, frame: 20, skip: 0, ftime: 150, usetick: 0 },
    ActCritical: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActStruck: { start: 0, frame: 1, skip: 9, ftime: 0, usetick: 0 },
    ActDie: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActDeath: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 }
};

// MA52
const MA52 = {
    ActStand: { start: 30, frame: 4, skip: 6, ftime: 200, usetick: 0 },
    ActWalk: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActAttack: { start: 30, frame: 4, skip: 6, ftime: 150, usetick: 0 },
    ActCritical: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActStruck: { start: 0, frame: 1, skip: 9, ftime: 0, usetick: 0 },
    ActDie: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 },
    ActDeath: { start: 0, frame: 0, skip: 0, ftime: 0, usetick: 0 }
};

// ===================== 全局查表数组 =====================
/**
 * 武器朝向表 WORDER[性别][帧索引]
 * 1 = 刀在前，0 = 刀在后
 * 索引0 = 男性，索引1 = 女性
 */
const WORDER = [
    // ========== 男性 ==========
    [
        // 站立
        0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
        1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1,
        0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1,
        // 行走
        0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
        1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
        0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1,
        // 奔跑
        0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
        1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1,
        0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1,
        // 战斗模式
        0, 1, 1, 1, 0, 0, 0, 0,
        // 攻击
        1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0,
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1,
        // 攻击2
        0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0,
        1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1,
        0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 1, 1,
        // 攻击3
        1, 1, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0,
        1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0,
        // 魔法
        0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1,
        1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1,
        0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1,
        // 坐下
        0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0,
        // 受击
        0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
        1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1,
        0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1,
        // 倒地
        0, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
        1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1,
        0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1
    ],

    // ========== 女性 ==========
    [
        // 站立
        0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
        1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1,
        0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1,
        // 行走
        0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
        1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
        0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1,
        // 奔跑
        0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
        1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1,
        0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1,
        // 战斗模式
        1, 1, 1, 1, 0, 0, 0, 0,
        // 攻击
        1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0,
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1,
        // 攻击2
        0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0,
        1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1,
        0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 1, 1,
        // 攻击3
        1, 1, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0,
        1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0,
        // 魔法
        0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1,
        1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1,
        0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1,
        // 坐下
        0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0,
        // 受击
        0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
        1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1,
        0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1,
        // 倒地
        0, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
        1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1,
        0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1
    ]
];

// ===================== 工具函数 =====================

/**
 * 根据种族和外观ID获取怪物动作配置
 * @param {number} race 种族ID
 * @param {number} appr 外观ID
 * @returns {object} 怪物动作表对象
 */
function RaceByPM(race, appr) {
    let result = null;
    // 注：此处race为图像种族分类
    switch (race) {
        case 9: result = MA9; break;
        case 10: result = MA10; break;
        case 11: result = MA11; break;
        case 12: case 24: result = MA12; break;
        case 13: result = MA13; break;
        case 14: case 17: case 18: case 23:
            result = MA14; break;
        case 15: case 22: result = MA15; break;
        case 16: result = MA16; break;
        case 30: case 31: result = MA17; break;
        case 19: case 20: case 21:
        case 37: case 40: case 45: case 52: case 53:
            result = MA19; break;
        case 41: case 42: result = MA20; break;
        case 43: result = MA21; break;
        case 47: result = MA22; break;
        case 48: case 49: result = MA23; break;
        case 32: result = MA24; break; // 蝎子，两种攻击
        case 33: result = MA25; break; // 蜈蚣王
        case 34: result = MA30; break; // 血巨人王、心脏
        case 35: result = MA31; break; // 爆眼蜘蛛
        case 36: result = MA32; break; // 暴走
        case 54: result = MA28; break;
        case 55: result = MA29; break; // 神兽(变身后)
        case 60: case 61: case 62:
            result = MA33; break; // 雷血士、王盾、蛛魔本王
        case 63: result = MA34; break;
        case 64: case 65: case 66: case 67: case 68: case 69:
            result = MA19; break; // 狼人鬼、骷髅系列
        case 70: case 71: case 72:
            result = MA33; break; // 夜叉系列、四天天王
        case 98: result = MA27; break;
        case 99: result = MA26; break;
        case 50: // NPC分支
            switch (appr) {
                case 23: result = MA51; break;
                case 24: case 25: result = MA52; break;
                default: result = MA50;
            }
            break;
    }
    return result;
}

/**
 * 根据外观ID获取怪物图像资源
 * @param {number} appr 外观ID
 * @returns {object} 图像表面对象
 */
function GetMonImg(appr) {
    let result = 'mon1'; // 默认资源
    const group = Math.floor(appr / 10);
    switch (group) {
        //case 0:  result = 'mon1'; break;
        case 1: result = 'mon2'; break;
        case 2: result = 'mon3'; break;
        case 3: result = 'mon4'; break;
        case 4: result = 'mon5'; break;
        case 5: result = 'mon6'; break;
        case 6: result = 'mon7'; break;
        case 7: result = 'mon8'; break;
        case 8: result = 'mon9'; break;
        case 9: result = 'mon10'; break;
        case 10: result = 'mon11'; break;
        case 11: result = 'mon12'; break;
        case 12: result = 'mon13'; break;
        case 13: result = 'mon14'; break;
        case 14: result = 'mon15'; break;
        case 15: result = 'mon16'; break;
        case 16: result = 'mon17'; break;
        case 17: result = 'mon18'; break;
        case 18: result = 'mon19'; break;
        case 19: result = 'mon20'; break;
        case 20: result = 'mon21'; break;
        case 90: result = 'effect'; break; // 城门、城墙特效
    }
    return result;
}

/**
 * 获取怪物图像Y轴偏移量
 * @param {number} appr 外观ID
 * @returns {number} 像素偏移值
 */
function GetOffset(appr) {
    let result = 0;
    const nrace = Math.floor(appr / 10);
    const npos = appr % 10;

    switch (nrace) {
        case 0:
            result = npos * 280; // 8帧基础
            break;
        case 1:
            result = npos * 230;
            break;
        case 2: case 3:
        case 7: case 8: case 9: case 10: case 11: case 12:
        case 14: case 15: case 16:
            result = npos * 360; // 10帧基础
            break;
        case 13:
            switch (npos) {
                case 1: result = 360; break;   // 赤月魔
                case 2: result = 440; break;   // 爆眼蜘蛛
                case 3: result = 550; break;   // 暴走
                default: result = npos * 360;
            }
            break;
        case 4:
            result = npos * 360;
            if (npos === 1) result = 600; // 毒魔蠕虫
            break;
        case 5:
            result = npos * 430; // 僵尸
            break;
        case 6:
            result = npos * 440; // 蛛魔系列
            break;
        case 17:
            result = npos * 350; // 神兽
            break;
        case 18:
            switch (npos) {
                case 0: result = 0; break;     // 雷血士
                case 1: result = 520; break;   // 王盾
                case 2: result = 950; break;   // 蛛魔本王
            }
            break;
        case 19:
            switch (npos) {
                case 0: result = 0; break;     // 狼人鬼
                case 1: result = 370; break;   // 腐蚀鬼
                case 2: result = 810; break;   // 骷髅武装
                case 3: result = 1250; break;  // 骷髅兵卒
                case 4: result = 1630; break;  // 骷髅武士
                case 5: result = 2010; break;  // 骷髅弓箭手
                case 6: result = 2390; break;  // 骷髅法王
            }
            break;
        case 20:
            switch (npos) {
                case 0: result = 0; break;     // 夜叉鬼卒
                case 1: result = 360; break;   // 夜叉冰鬼
                case 2: result = 720; break;   // 夜叉云鬼
                case 3: result = 1080; break;  // 夜叉风鬼
                case 4: result = 1440; break;  // 夜叉火鬼
                case 5: result = 1800; break;  // 夜叉右使
                case 6: result = 2350; break;  // 夜叉左使
                case 7: result = 3060; break;  // 四天天王
            }
            break;
        case 90:
            switch (npos) {
                case 0: result = 80; break;    // 城门
                case 1: result = 168; break;
                case 2: result = 184; break;
                case 3: result = 200; break;
            }
            break;
    }
    return result;
}

/**
 * 获取NPC图像偏移量
 * @param {number} appr 外观ID
 * @returns {number} 像素偏移值
 */
function GetNpcOffset(appr) {
    if (appr >= 0 && appr <= 22) {
        return MERCHANTFRAME * appr;
    } else if (appr === 23) {
        return 1380;
    } else {
        return 1470 + MERCHANTFRAME * (appr - 24);
    }
}

export { HA, RaceByPM, GetMonImg, GetOffset, GetNpcOffset }