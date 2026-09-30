package com.jootm2.server.game;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * A bidimensional tile grid holding the creatures that occupy it. Mirrors the
 * Envir/Map handling in M2Share.pas but simplified to a single default map.
 * 0 = walkable, 1 = blocking.
 */
public final class GameMap {

    public final String name;
    public final int width;
    public final int height;
    private final byte[] cells;
    private final Map<Long, Actor> actors = new LinkedHashMap<>();

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

    public boolean isOccupied(int x, int y) {
        for (Actor a : actors.values()) {
            if (a.alive && a.x == x && a.y == y) {
                return true;
            }
        }
        return false;
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