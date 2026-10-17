package com.jootm2.server.game;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A bidimensional tile grid holding the creatures that occupy it. Mirrors the
 * Envir/Map handling in M2Share.pas but simplified to a single default map.
 * 0 = walkable, 1 = blocking. Also tracks door tiles (open/close state).
 */
public final class GameMap {

    public final String name;
    public final int width;
    public final int height;
    private final byte[] cells;
    private final Map<Long, Actor> actors = new LinkedHashMap<>();
    private final Map<Integer, Boolean> doors = new HashMap<>();      // y*width+x -> 是否打开
    private final Map<Integer, Long> doorOpenAt = new HashMap<>();    // y*width+x -> 开门时间

    public GameMap(String name, int width, int height) {
        this.name = name;
        this.width = width;
        this.height = height;
        this.cells = new byte[width * height];
    }

    public boolean inside(int x, int y) {
        return x >= 0 && y >= 0 && x < width && y < height;
    }

    public boolean canWalk(int x, int y) {
        return inside(x, y) && cells[y * width + x] == 0;
    }

    public void setBlocked(int x, int y, boolean blocked) {
        if (inside(x, y)) {
            cells[y * width + x] = blocked ? (byte) 1 : (byte) 0;
        }
    }

    /** 高墙（原版 MP_HIGHWALL/MoveAttr=2，即 FrImg 0x8000）：阻挡移动 + 阻挡飞行/视线。 */
    private static final byte HIGH_WALL = 2;

    /** 飞行/视线能否通过该格（原版 Envir.CanFireFly：只有高墙阻挡，普通阻挡不挡）。 */
    public boolean canFireFly(int x, int y) {
        return inside(x, y) && cells[y * width + x] != HIGH_WALL;
    }

    /** 标记高墙（阻挡移动 + 飞行/视线）。 */
    public void setHighWall(int x, int y) {
        if (inside(x, y)) {
            cells[y * width + x] = HIGH_WALL;
        }
    }

    public boolean isOccupied(int x, int y) {
        for (Actor a : actors.values()) {
            if (a.alive && a.x == x && a.y == y) {
                return true;
            }
        }
        return false;
    }

    // -- doors ----------------------------------------------------------------

    /** 登记一个门 tile（初始关闭、阻挡）。 */
    public void setDoor(int x, int y) {
        if (inside(x, y)) {
            doors.put(y * width + x, false);
            setBlocked(x, y, true);
        }
    }

    public boolean isDoor(int x, int y) {
        return inside(x, y) && doors.containsKey(y * width + x);
    }

    public boolean isDoorOpen(int x, int y) {
        Boolean o = doors.get(y * width + x);
        return o != null && o;
    }

    public void openDoor(int x, int y, long now) {
        if (isDoor(x, y)) {
            doors.put(y * width + x, true);
            doorOpenAt.put(y * width + x, now);
            setBlocked(x, y, false);
        }
    }

    public void closeDoor(int x, int y) {
        if (isDoor(x, y)) {
            doors.put(y * width + x, false);
            setBlocked(x, y, true);
        }
    }

    /** 关闭所有打开超时的门，返回被关闭的门坐标列表（供广播）。 */
    public List<int[]> closeTimedOutDoors(long now, long openDurationMs) {
        List<int[]> closed = new ArrayList<>();
        for (Map.Entry<Integer, Long> e : new HashMap<>(doorOpenAt).entrySet()) {
            if (now - e.getValue() >= openDurationMs) {
                int idx = e.getKey();
                int x = idx % width;
                int y = idx / width;
                closeDoor(x, y);
                doorOpenAt.remove(idx);
                closed.add(new int[]{x, y});
            }
        }
        return closed;
    }

    /** Finds a random walkable, unoccupied cell. */
    public int[] randomFreeCell() {
        for (int attempt = 0; attempt < 1000; attempt++) {
            int x = (int) (Math.random() * width);
            int y = (int) (Math.random() * height);
            if (canWalk(x, y) && !isOccupied(x, y)) {
                return new int[]{x, y};
            }
        }
        return new int[]{width / 2, height / 2};
    }

    public void add(Actor a) {
        a.map = this;
        actors.put(a.id, a);
    }

    public void remove(long id) {
        actors.remove(id);
    }

    public Actor actor(long id) {
        return actors.get(id);
    }

    public Collection<Actor> actors() {
        return actors.values();
    }

    public int actorCount() {
        return actors.size();
    }
}