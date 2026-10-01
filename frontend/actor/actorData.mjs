// 实体外观数据（对应 Delphi 客户端 Actor.pas 的常量与函数）
// 移植来源：/Volumes/未命名/fire/Source/Client/Actor.pas
//   - HA（人类动作表）、MA9~MA52（怪物/NPC 动作表）
//   - RaceByPM / GetMonImg / GetOffset / GetNpcOffset
// 图库 key 与 resources.json 的小写 base name 对应：hum/hair/weapon/mon1~mon21/npc。

const HUMANFRAME = 600;       // 每个人物外观占 600 帧
const MERCHANTFRAME = 60;     // 每个 NPC 外观占 60 帧（GetNpcOffset）

// 动作段：[start, frame, skip, ftime]
// 帧布局：方向块起始 = offset + start + dir * (frame + skip)

// 人类动作表（THumanAction HA）
export const HA = {
    stand:  { start: 0,   frame: 4, skip: 4, ftime: 200 },
    walk:   { start: 64,  frame: 6, skip: 2, ftime: 90 },
    run:    { start: 128, frame: 6, skip: 2, ftime: 120 },
    hit:    { start: 200, frame: 6, skip: 2, ftime: 85 },
    spell:  { start: 392, frame: 6, skip: 2, ftime: 60 },
    struck: { start: 472, frame: 3, skip: 5, ftime: 70 },
    die:    { start: 536, frame: 4, skip: 4, ftime: 120 },
};

// 怪物动作表：name -> { stand, walk, attack, struck, die, death }
// 每个动作段 { start, frame, skip, ftime }
const MA = {
    MA9: {
        stand: { start: 0, frame: 1, skip: 7, ftime: 200 },
        walk: { start: 64, frame: 6, skip: 2, ftime: 120 },
        attack: { start: 64, frame: 6, skip: 2, ftime: 150 },
        struck: { start: 64, frame: 6, skip: 2, ftime: 100 },
        die: { start: 0, frame: 1, skip: 7, ftime: 140 },
        death: { start: 0, frame: 1, skip: 7, ftime: 0 },
    },
    MA10: {
        stand: { start: 0, frame: 4, skip: 4, ftime: 200 },
        walk: { start: 64, frame: 6, skip: 2, ftime: 120 },
        attack: { start: 128, frame: 4, skip: 4, ftime: 150 },
        struck: { start: 192, frame: 2, skip: 0, ftime: 100 },
        die: { start: 208, frame: 4, skip: 4, ftime: 140 },
        death: { start: 272, frame: 1, skip: 0, ftime: 0 },
    },
    MA11: {
        stand: { start: 0, frame: 4, skip: 6, ftime: 200 },
        walk: { start: 80, frame: 6, skip: 4, ftime: 120 },
        attack: { start: 160, frame: 6, skip: 4, ftime: 100 },
        struck: { start: 240, frame: 2, skip: 0, ftime: 100 },
        die: { start: 260, frame: 10, skip: 0, ftime: 140 },
        death: { start: 340, frame: 1, skip: 0, ftime: 0 },
    },
    MA12: {
        stand: { start: 0, frame: 4, skip: 4, ftime: 200 },
        walk: { start: 64, frame: 6, skip: 2, ftime: 120 },
        attack: { start: 128, frame: 6, skip: 2, ftime: 150 },
        struck: { start: 192, frame: 2, skip: 0, ftime: 150 },
        die: { start: 208, frame: 4, skip: 4, ftime: 160 },
        death: { start: 272, frame: 1, skip: 0, ftime: 0 },
    },
    MA13: {
        stand: { start: 0, frame: 4, skip: 6, ftime: 200 },
        walk: { start: 10, frame: 8, skip: 2, ftime: 160 },
        attack: { start: 30, frame: 6, skip: 4, ftime: 120 },
        struck: { start: 110, frame: 2, skip: 0, ftime: 100 },
        die: { start: 130, frame: 10, skip: 0, ftime: 120 },
        death: { start: 20, frame: 9, skip: 0, ftime: 150 },
    },
    MA14: {
        stand: { start: 0, frame: 4, skip: 6, ftime: 200 },
        walk: { start: 80, frame: 6, skip: 4, ftime: 160 },
        attack: { start: 160, frame: 6, skip: 4, ftime: 100 },
        struck: { start: 240, frame: 2, skip: 0, ftime: 100 },
        die: { start: 260, frame: 10, skip: 0, ftime: 120 },
        death: { start: 340, frame: 10, skip: 0, ftime: 100 },
    },
    MA15: {
        stand: { start: 0, frame: 4, skip: 6, ftime: 200 },
        walk: { start: 80, frame: 6, skip: 4, ftime: 160 },
        attack: { start: 160, frame: 6, skip: 4, ftime: 100 },
        struck: { start: 240, frame: 2, skip: 0, ftime: 100 },
        die: { start: 260, frame: 10, skip: 0, ftime: 120 },
        death: { start: 1, frame: 1, skip: 0, ftime: 100 },
    },
    MA16: {
        stand: { start: 0, frame: 4, skip: 6, ftime: 200 },
        walk: { start: 80, frame: 6, skip: 4, ftime: 160 },
        attack: { start: 160, frame: 6, skip: 4, ftime: 160 },
        struck: { start: 240, frame: 2, skip: 0, ftime: 100 },
        die: { start: 260, frame: 4, skip: 6, ftime: 160 },
        death: { start: 0, frame: 1, skip: 0, ftime: 160 },
    },
    MA17: {
        stand: { start: 0, frame: 4, skip: 6, ftime: 60 },
        walk: { start: 80, frame: 6, skip: 4, ftime: 160 },
        attack: { start: 160, frame: 6, skip: 4, ftime: 100 },
        struck: { start: 240, frame: 2, skip: 0, ftime: 100 },
        die: { start: 260, frame: 10, skip: 0, ftime: 100 },
        death: { start: 340, frame: 1, skip: 0, ftime: 140 },
    },
    MA19: {
        stand: { start: 0, frame: 4, skip: 6, ftime: 200 },
        walk: { start: 80, frame: 6, skip: 4, ftime: 160 },
        attack: { start: 160, frame: 6, skip: 4, ftime: 100 },
        struck: { start: 240, frame: 2, skip: 0, ftime: 100 },
        die: { start: 260, frame: 10, skip: 0, ftime: 140 },
        death: { start: 340, frame: 1, skip: 0, ftime: 140 },
    },
    MA20: {
        stand: { start: 0, frame: 4, skip: 6, ftime: 200 },
        walk: { start: 80, frame: 6, skip: 4, ftime: 160 },
        attack: { start: 160, frame: 6, skip: 4, ftime: 120 },
        struck: { start: 240, frame: 2, skip: 0, ftime: 100 },
        die: { start: 260, frame: 10, skip: 0, ftime: 100 },
        death: { start: 340, frame: 10, skip: 0, ftime: 170 },
    },
    MA21: {
        stand: { start: 0, frame: 4, skip: 6, ftime: 200 },
        walk: { start: 0, frame: 0, skip: 0, ftime: 0 },
        attack: { start: 10, frame: 6, skip: 4, ftime: 120 },
        struck: { start: 20, frame: 2, skip: 0, ftime: 100 },
        die: { start: 30, frame: 10, skip: 0, ftime: 160 },
        death: { start: 0, frame: 0, skip: 0, ftime: 0 },
    },
    MA22: {
        stand: { start: 80, frame: 4, skip: 6, ftime: 200 },
        walk: { start: 160, frame: 6, skip: 4, ftime: 160 },
        attack: { start: 240, frame: 6, skip: 4, ftime: 100 },
        struck: { start: 320, frame: 2, skip: 0, ftime: 100 },
        die: { start: 340, frame: 10, skip: 0, ftime: 160 },
        death: { start: 0, frame: 6, skip: 4, ftime: 170 },
    },
    MA23: {
        stand: { start: 20, frame: 4, skip: 6, ftime: 200 },
        walk: { start: 100, frame: 6, skip: 4, ftime: 160 },
        attack: { start: 180, frame: 6, skip: 4, ftime: 100 },
        struck: { start: 260, frame: 2, skip: 0, ftime: 100 },
        die: { start: 280, frame: 10, skip: 0, ftime: 160 },
        death: { start: 0, frame: 20, skip: 0, ftime: 100 },
    },
    MA24: {
        stand: { start: 0, frame: 4, skip: 6, ftime: 200 },
        walk: { start: 80, frame: 6, skip: 4, ftime: 160 },
        attack: { start: 160, frame: 6, skip: 4, ftime: 100 },
        struck: { start: 320, frame: 2, skip: 0, ftime: 100 },
        die: { start: 340, frame: 10, skip: 0, ftime: 140 },
        death: { start: 420, frame: 1, skip: 0, ftime: 140 },
    },
    MA25: {
        stand: { start: 0, frame: 4, skip: 6, ftime: 200 },
        walk: { start: 70, frame: 10, skip: 0, ftime: 200 },
        attack: { start: 20, frame: 6, skip: 4, ftime: 120 },
        struck: { start: 50, frame: 2, skip: 0, ftime: 100 },
        die: { start: 60, frame: 10, skip: 0, ftime: 200 },
        death: { start: 80, frame: 10, skip: 0, ftime: 200 },
    },
    MA26: {
        stand: { start: 0, frame: 1, skip: 7, ftime: 200 },
        walk: { start: 0, frame: 0, skip: 0, ftime: 160 },
        attack: { start: 56, frame: 6, skip: 2, ftime: 500 },
        struck: { start: 0, frame: 4, skip: 4, ftime: 100 },
        die: { start: 24, frame: 10, skip: 0, ftime: 120 },
        death: { start: 0, frame: 0, skip: 0, ftime: 150 },
    },
    MA27: {
        stand: { start: 0, frame: 1, skip: 7, ftime: 200 },
        walk: { start: 0, frame: 0, skip: 0, ftime: 160 },
        attack: { start: 0, frame: 0, skip: 0, ftime: 250 },
        struck: { start: 0, frame: 0, skip: 0, ftime: 100 },
        die: { start: 0, frame: 10, skip: 0, ftime: 120 },
        death: { start: 0, frame: 0, skip: 0, ftime: 150 },
    },
    MA28: {
        stand: { start: 80, frame: 4, skip: 6, ftime: 200 },
        walk: { start: 160, frame: 6, skip: 4, ftime: 160 },
        attack: { start: 0, frame: 6, skip: 4, ftime: 100 },
        struck: { start: 240, frame: 2, skip: 0, ftime: 100 },
        die: { start: 260, frame: 10, skip: 0, ftime: 120 },
        death: { start: 0, frame: 10, skip: 0, ftime: 100 },
    },
    MA29: {
        stand: { start: 80, frame: 4, skip: 6, ftime: 200 },
        walk: { start: 160, frame: 6, skip: 4, ftime: 160 },
        attack: { start: 240, frame: 6, skip: 4, ftime: 100 },
        struck: { start: 320, frame: 2, skip: 0, ftime: 100 },
        die: { start: 340, frame: 10, skip: 0, ftime: 120 },
        death: { start: 0, frame: 10, skip: 0, ftime: 100 },
    },
    MA30: {
        stand: { start: 0, frame: 4, skip: 6, ftime: 200 },
        walk: { start: 0, frame: 10, skip: 0, ftime: 200 },
        attack: { start: 10, frame: 6, skip: 4, ftime: 120 },
        struck: { start: 20, frame: 2, skip: 0, ftime: 100 },
        die: { start: 30, frame: 20, skip: 0, ftime: 150 },
        death: { start: 0, frame: 10, skip: 0, ftime: 200 },
    },
    MA31: {
        stand: { start: 0, frame: 4, skip: 6, ftime: 200 },
        walk: { start: 0, frame: 10, skip: 0, ftime: 200 },
        attack: { start: 10, frame: 6, skip: 4, ftime: 120 },
        struck: { start: 0, frame: 2, skip: 8, ftime: 100 },
        die: { start: 20, frame: 10, skip: 0, ftime: 200 },
        death: { start: 0, frame: 10, skip: 0, ftime: 200 },
    },
    MA32: {
        stand: { start: 0, frame: 1, skip: 9, ftime: 200 },
        walk: { start: 0, frame: 6, skip: 4, ftime: 200 },
        attack: { start: 0, frame: 6, skip: 4, ftime: 120 },
        struck: { start: 0, frame: 2, skip: 8, ftime: 100 },
        die: { start: 80, frame: 10, skip: 0, ftime: 80 },
        death: { start: 80, frame: 10, skip: 0, ftime: 200 },
    },
    MA33: {
        stand: { start: 0, frame: 4, skip: 6, ftime: 200 },
        walk: { start: 80, frame: 6, skip: 4, ftime: 200 },
        attack: { start: 160, frame: 6, skip: 4, ftime: 120 },
        struck: { start: 240, frame: 2, skip: 0, ftime: 100 },
        die: { start: 260, frame: 10, skip: 0, ftime: 200 },
        death: { start: 260, frame: 10, skip: 0, ftime: 200 },
    },
    MA34: {
        stand: { start: 0, frame: 4, skip: 6, ftime: 200 },
        walk: { start: 80, frame: 6, skip: 4, ftime: 200 },
        attack: { start: 160, frame: 6, skip: 4, ftime: 120 },
        struck: { start: 400, frame: 2, skip: 0, ftime: 100 },
        die: { start: 420, frame: 20, skip: 0, ftime: 200 },
        death: { start: 420, frame: 20, skip: 0, ftime: 200 },
    },
    MA50: {
        stand: { start: 0, frame: 4, skip: 6, ftime: 200 },
        walk: { start: 0, frame: 0, skip: 0, ftime: 0 },
        attack: { start: 30, frame: 10, skip: 0, ftime: 150 },
        struck: { start: 0, frame: 1, skip: 9, ftime: 0 },
        die: { start: 0, frame: 0, skip: 0, ftime: 0 },
        death: { start: 0, frame: 0, skip: 0, ftime: 0 },
    },
    MA51: {
        stand: { start: 0, frame: 4, skip: 6, ftime: 200 },
        walk: { start: 0, frame: 0, skip: 0, ftime: 0 },
        attack: { start: 30, frame: 20, skip: 0, ftime: 150 },
        struck: { start: 0, frame: 1, skip: 9, ftime: 0 },
        die: { start: 0, frame: 0, skip: 0, ftime: 0 },
        death: { start: 0, frame: 0, skip: 0, ftime: 0 },
    },
    MA52: {
        stand: { start: 30, frame: 4, skip: 6, ftime: 200 },
        walk: { start: 0, frame: 0, skip: 0, ftime: 0 },
        attack: { start: 30, frame: 4, skip: 6, ftime: 150 },
        struck: { start: 0, frame: 1, skip: 9, ftime: 0 },
        die: { start: 0, frame: 0, skip: 0, ftime: 0 },
        death: { start: 0, frame: 0, skip: 0, ftime: 0 },
    },
};

// RaceByPM：raceImg（图像种族 9~99）→ 动作表名
const RACE_ACTION = {
    9: 'MA9', 10: 'MA10', 11: 'MA11',
    12: 'MA12', 24: 'MA12',
    13: 'MA13',
    14: 'MA14', 17: 'MA14', 18: 'MA14', 23: 'MA14',
    15: 'MA15', 22: 'MA15',
    16: 'MA16',
    30: 'MA17', 31: 'MA17',
    19: 'MA19', 20: 'MA19', 21: 'MA19', 37: 'MA19',
    40: 'MA19', 45: 'MA19', 52: 'MA19', 53: 'MA19',
    64: 'MA19', 65: 'MA19', 66: 'MA19', 67: 'MA19', 68: 'MA19', 69: 'MA19',
    41: 'MA20', 42: 'MA20',
    43: 'MA21',
    47: 'MA22',
    48: 'MA23', 49: 'MA23',
    32: 'MA24',
    33: 'MA25',
    34: 'MA30',
    35: 'MA31',
    36: 'MA32',
    54: 'MA28',
    55: 'MA29',
    60: 'MA33', 61: 'MA33', 62: 'MA33',
    70: 'MA33', 71: 'MA33', 72: 'MA33',
    63: 'MA34',
    98: 'MA27',
    99: 'MA26',
};

/** 根据 raceImg 返回动作表（含各动作段），未匹配返回 null。 */
export function raceByPM(raceImg) {
    const name = RACE_ACTION[raceImg];
    return name ? MA[name] : null;
}

/** NPC（race=50）动作表：按 appr 选 MA50/51/52。 */
export function npcAction(appr) {
    if (appr === 23) return MA.MA51;
    if (appr === 24 || appr === 25) return MA.MA52;
    return MA.MA50;
}

/** GetMonImg：appr → 图库 key（mon1~mon21 / effect）。 */
export function getMonImgLib(appr) {
    const n = Math.floor(appr / 10);
    if (n === 0) return 'mon1';
    if (n >= 1 && n <= 20) return 'mon' + (n + 1);
    if (n === 90) return 'effect';
    return 'mon1';   // 默认
}

/** GetOffset：appr → 帧偏移。 */
export function getMonOffset(appr) {
    const nrace = Math.floor(appr / 10);
    const npos = appr % 10;
    switch (nrace) {
        case 0: return npos * 280;
        case 1: return npos * 230;
        case 2:
        case 3:
        case 7:
        case 8:
        case 9:
        case 10:
        case 11:
        case 12:
        case 14:
        case 15:
        case 16: return npos * 360;
        case 13:
            if (npos === 1) return 360;
            if (npos === 2) return 440;
            if (npos === 3) return 550;
            return npos * 360;
        case 4:
            if (npos === 1) return 600;
            return npos * 360;
        case 5: return npos * 430;
        case 6: return npos * 440;
        case 17: return npos * 350;
        case 18:
            if (npos === 0) return 0;
            if (npos === 1) return 520;
            if (npos === 2) return 950;
            return 0;
        case 19: {
            const t = [0, 370, 810, 1250, 1630, 2010, 2390];
            return npos < t.length ? t[npos] : 0;
        }
        case 20: {
            const t = [0, 360, 720, 1080, 1440, 1800, 2350, 3060];
            return npos < t.length ? t[npos] : 0;
        }
        case 90: {
            const t = [80, 168, 184, 200];
            return npos < t.length ? t[npos] : 80;
        }
        default: return 0;
    }
}

/** GetNpcOffset：appr → NPC 帧偏移。 */
export function getNpcOffset(appr) {
    if (appr >= 0 && appr <= 22) return MERCHANTFRAME * appr;
    if (appr === 23) return 1380;
    return 1470 + MERCHANTFRAME * (appr - 24);
}

/**
 * 计算某个动作在给定方向下的起始帧索引 + 帧数 + 帧时长。
 * 帧布局：方向块起始 = offset + act.start + dir * (act.frame + act.skip)
 */
export function actionFrames(offset, act, dir) {
    const d = ((dir % 8) + 8) % 8;      // 0..7
    const start = offset + act.start + d * (act.frame + act.skip);
    return { start, count: act.frame, ftime: act.ftime };
}

export { HUMANFRAME, MERCHANTFRAME };
