package com.jootm2.server.game.common;

/**
 * 8-direction values identical to the original DR_* constants in Grobal2.pas.
 * Mir 2 uses a clock-face direction scheme.
 */
public final class Direction {

    public static final int UP = 0;
    public static final int UP_RIGHT = 1;
    public static final int RIGHT = 2;
    public static final int DOWN_RIGHT = 3;
    public static final int DOWN = 4;
    public static final int DOWN_LEFT = 5;
    public static final int LEFT = 6;
    public static final int UP_LEFT = 7;

    private Direction() {
    }

    /** X offset for a single step in the given direction. */
    public static int dx(int dir) {
        switch (dir & 7) {
            case UP_RIGHT:
            case RIGHT:
            case DOWN_RIGHT:
                return 1;
            case UP_LEFT:
            case LEFT:
            case DOWN_LEFT:
                return -1;
            default:
                return 0;
        }
    }

    /** Y offset for a single step in the given direction. */
    public static int dy(int dir) {
        switch (dir & 7) {
            case DOWN_RIGHT:
            case DOWN:
            case DOWN_LEFT:
                return 1;
            case UP_LEFT:
            case UP:
            case UP_RIGHT:
                return -1;
            default:
                return 0;
        }
    }

    /** Turns the direction clockwise by {@code rotateCount} steps (mod 8). */
    public static int turn(int dir, int rotateCount) {
        return ((dir + rotateCount) % 8 + 8) % 8;
    }

    /** Left-side neighbour of the direction (mirrors LeftDir in MudUtil.pas). */
    public static int left(int dir) {
        return (dir + 6) % 8;
    }

    /** Right-side neighbour of the direction (mirrors RightDir in MudUtil.pas). */
    public static int right(int dir) {
        return (dir + 2) % 8;
    }
}