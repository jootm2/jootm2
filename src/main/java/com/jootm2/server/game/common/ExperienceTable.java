package com.jootm2.server.game.common;

/**
 * Want-to-exp table ported from NEEDEXPS in M2Share.pas (MAXLEVEL = 101).
 * Index 0 corresponds to level 1, index 100 to level 101.
 * The table is cumulative: the value is how much total experience is needed to
 * advance *from* that level to the next one.
 */
public final class ExperienceTable {

    public static final int MAX_LEVEL = 101;

    private static final int[] NEED_EXPS = {
            100,          // 1
            200,          // 2
            300,          // 3
            400,          // 4
            600,          // 5
            900,          // 6
            1200,         // 7
            1700,         // 8
            2500,         // 9
            6000,         // 10
            8000,         // 11
            10000,        // 12
            15000,        // 13
            30000,        // 14
            40000,        // 15
            50000,        // 16
            70000,        // 17
            100000,       // 18
            120000,       // 19
            140000,       // 20
            250000,       // 21
            300000,       // 22
            350000,       // 23
            400000,       // 24
            500000,       // 25
            700000,       // 26
            1000000,      // 27
            1400000,      // 28
            1800000,      // 29
            2000000,      // 30
            2400000,      // 31
            2800000,      // 32
            3200000,      // 33
            3600000,      // 34
            4000000,      // 35
            4800000,      // 36
            5600000,      // 37
            8200000,      // 38
            9000000,      // 39
            12000000,     // 40
            16000000,     // 41
            30000000,     // 42
            50000000,     // 43
            80000000,     // 44
            120000000,    // 45
            160000000,    // 46
            200000000,    // 47
            250000000,    // 48
            300000000,    // 49
            350000000,    // 50
            400000000,    // 51
            480000000,    // 52
            560000000,    // 53
            640000000,    // 54
            740000000,    // 55
            840000000,    // 56
            950000000,    // 57
            1070000000,   // 58
            1200000000,   // 59
            1500000000,   // 60
            1500000000,   // 61
            1600000000,   // 62
            1600000000,   // 63
            1700000000,   // 64
            1700000000,   // 65
            1800000000,   // 66
            1800000000,   // 67
            1900000000,   // 68
            1900000000,   // 69
            2000000000,   // 70
            2000000000,   // 71
            2000000000,   // 72
            2000000000,   // 73
            2000000000,   // 74
            2000000000,   // 75
            2000000000,   // 76
            2000000000,   // 77
            2000000000,   // 78
            2000000000,   // 79
            2000000000,   // 80
            2000000000,   // 81
            2000000000,   // 82
            2000000000,   // 83
            2000000000,   // 84
            2000000000,   // 85
            2000000000,   // 86
            2000000000,   // 87
            2000000000,   // 88
            2000000000,   // 89
            2000000000,   // 90
            2100000000,   // 91
            2100000000,   // 92
            2100000000,   // 93
            2100000000,   // 94
            2100000000,   // 95
            2100000000,   // 96
            2100000000,   // 97
            2100000000,   // 98
            2100000000,   // 99
            2100000000,   // 100
            2140000000    // 101
    };

    private ExperienceTable() {
    }

    /** Experience required to advance from {@code level} (1-based) to level+1. */
    public static int expForLevel(int level) {
        if (level < 1) {
            return NEED_EXPS[0];
        }
        if (level > MAX_LEVEL) {
            return NEED_EXPS[MAX_LEVEL - 1];
        }
        return NEED_EXPS[level - 1];
    }

    /** Returns the level for an absolute {@code exp} total, 1-based. */
    public static int levelForExp(long exp) {
        return binarySearchLevel(exp);
    }

    private static int binarySearchLevel(long exp) {
        long total = 0L;
        for (int level = 1; level <= MAX_LEVEL; level++) {
            total += expForLevel(level);
            if (exp < total) {
                return level;
            }
        }
        return MAX_LEVEL;
    }
}