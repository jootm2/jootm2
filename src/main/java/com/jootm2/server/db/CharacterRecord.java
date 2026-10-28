package com.jootm2.server.db;

import com.jootm2.server.game.common.ItemInstance;

import java.util.ArrayList;
import java.util.List;

/**
 * Character persistence row. The in-memory game entity (Player) converts to and
 * from this record when loading/saving through CharacterDao.
 */
public final class CharacterRecord {
    public long id;
    public long accountId;
    public String name;
    public int sex;
    public int hair;
    public int job;
    public int level;
    public long exp;
    public String mapName = "default";
    public int x;
    public int y;
    public int dir;
    public int hp;
    public int mp;
    public long gold;
    public String homeMap = "default";
    public int homeX;
    public int homeY;
    public List<ItemInstance> items = new ArrayList<>();
    public List<ItemInstance> storage = new ArrayList<>();
    public String skills = "[]";
    /** 药水快捷栏 6 格的 makeIndex（0/缺失 = 空），对应原版 ItemArr[0..5]。 */
    public List<Integer> quickSlots = new ArrayList<>();
    public long createdAt;

    public CharacterRecord() {
    }
}