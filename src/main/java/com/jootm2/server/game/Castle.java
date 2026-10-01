package com.jootm2.server.game;

/**
 * The Sabuk castle state, mirroring {@code TUserCastle / TCastleManager} in
 * Castle.pas (simplified: main door + 3 wall segments + siege state).
 */
public final class Castle {

    public String name = "沙巴克";
    public String ownGuild = "";          // 城主行会（空 = 无主）
    public String mapId = "3";            // 城堡所在地图

    // 城门
    public int mainDoorX;
    public int mainDoorY;
    public int mainDoorHp;
    public int mainDoorMaxHp = 10000;
    public boolean mainDoorOpen;

    // 城墙（左/中/右 3 段）
    public final int[] wallX = new int[3];
    public final int[] wallY = new int[3];
    public final int[] wallHp = new int[3];
    public final int[] wallMaxHp = new int[3];

    // 攻城状态
    public boolean warActive = false;     // 攻城是否进行中
    public long warEndAt = 0;             // 攻城结束时间戳
    public String warGuild = "";          // 攻城行会

    public boolean doorBroken() {
        return mainDoorHp <= 0;
    }

    public int totalWallHp() {
        return wallHp[0] + wallHp[1] + wallHp[2];
    }

    public boolean wallsBroken() {
        return wallHp[0] <= 0 && wallHp[1] <= 0 && wallHp[2] <= 0;
    }
}
