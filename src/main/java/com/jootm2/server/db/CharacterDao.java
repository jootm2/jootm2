package com.jootm2.server.db;

import com.google.gson.reflect.TypeToken;
import com.jootm2.server.game.common.ItemInstance;

import java.lang.reflect.Type;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

/**
 * Character persistence, replaces HumDb.pas / FeeDb.pas in DBsrv200.
 */
public final class CharacterDao {

    private static final Type ITEM_LIST_TYPE = new TypeToken<List<ItemInstance>>() {
    }.getType();

    private final Database db;

    public CharacterDao(Database db) {
        this.db = db;
    }

    public List<CharacterRecord> listByAccount(long accountId) {
        Connection c = db.connection();
        synchronized (c) {
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT id, account_id, name, sex, hair, job, level, exp, map_name, x, y, dir, " +
                            "hp, mp, gold, home_map, home_x, home_y, items, storage, skills, created_at " +
                            "FROM characters WHERE account_id = ? ORDER BY id")) {
                ps.setLong(1, accountId);
                try (ResultSet rs = ps.executeQuery()) {
                    List<CharacterRecord> list = new ArrayList<>();
                    while (rs.next()) {
                        list.add(mapRow(rs));
                    }
                    return list;
                }
            } catch (SQLException e) {
                throw new RuntimeException("list characters failed", e);
            }
        }
    }

    /** 返回所有角色背包+仓库中最大的 makeIndex（用于重启后 makeIndex 序列不重复）。 */
    public long maxItemMakeIndex() {
        Connection c = db.connection();
        synchronized (c) {
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT items, storage FROM characters");
                 ResultSet rs = ps.executeQuery()) {
                long max = 0;
                while (rs.next()) {
                    max = Math.max(max, maxMakeIndex(rs.getString("items")));
                    max = Math.max(max, maxMakeIndex(rs.getString("storage")));
                }
                return max;
            } catch (SQLException e) {
                throw new RuntimeException("max item makeIndex failed", e);
            }
        }
    }

    private static long maxMakeIndex(String json) {
        long max = 0;
        List<ItemInstance> list = ItemInstance.GSON.fromJson(json, ITEM_LIST_TYPE);
        if (list != null) {
            for (ItemInstance it : list) {
                max = Math.max(max, it.makeIndex);
            }
        }
        return max;
    }

    public CharacterRecord findByName(String name) {
        Connection c = db.connection();
        synchronized (c) {
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT id, account_id, name, sex, hair, job, level, exp, map_name, x, y, dir, " +
                            "hp, mp, gold, home_map, home_x, home_y, items, storage, skills, created_at " +
                            "FROM characters WHERE name = ?")) {
                ps.setString(1, name);
                try (ResultSet rs = ps.executeQuery()) {
                    return rs.next() ? mapRow(rs) : null;
                }
            } catch (SQLException e) {
                throw new RuntimeException("find character failed", e);
            }
        }
    }

    public boolean nameExists(String name) {
        return findByName(name) != null;
    }

    public CharacterRecord insert(CharacterRecord r) {
        Connection c = db.connection();
        synchronized (c) {
            try (PreparedStatement ps = c.prepareStatement(
                    "INSERT INTO characters (account_id, name, sex, hair, job, level, exp, map_name, x, y, dir, " +
                            "hp, mp, gold, home_map, home_x, home_y, items, storage, skills, created_at) " +
                            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    Statement.RETURN_GENERATED_KEYS)) {
                ps.setLong(1, r.accountId);
                ps.setString(2, r.name);
                ps.setInt(3, r.sex);
                ps.setInt(4, r.hair);
                ps.setInt(5, r.job);
                ps.setInt(6, r.level);
                ps.setLong(7, r.exp);
                ps.setString(8, r.mapName);
                ps.setInt(9, r.x);
                ps.setInt(10, r.y);
                ps.setInt(11, r.dir);
                ps.setInt(12, r.hp);
                ps.setInt(13, r.mp);
                ps.setLong(14, r.gold);
                ps.setString(15, r.homeMap);
                ps.setInt(16, r.homeX);
                ps.setInt(17, r.homeY);
                ps.setString(18, ItemInstance.GSON.toJson(r.items));
                ps.setString(19, ItemInstance.GSON.toJson(r.storage));
                ps.setString(20, r.skills);
                ps.setLong(21, r.createdAt);
                ps.executeUpdate();
                try (ResultSet keys = ps.getGeneratedKeys()) {
                    if (keys.next()) {
                        r.id = keys.getLong(1);
                    }
                }
                return r;
            } catch (SQLException e) {
                throw new RuntimeException("insert character failed", e);
            }
        }
    }

    public void update(CharacterRecord r) {
        Connection c = db.connection();
        synchronized (c) {
            try (PreparedStatement ps = c.prepareStatement(
                    "UPDATE characters SET sex=?, hair=?, job=?, level=?, exp=?, map_name=?, x=?, y=?, dir=?, " +
                            "hp=?, mp=?, gold=?, home_map=?, home_x=?, home_y=?, items=?, storage=?, skills=? WHERE id=?")) {
                ps.setInt(1, r.sex);
                ps.setInt(2, r.hair);
                ps.setInt(3, r.job);
                ps.setInt(4, r.level);
                ps.setLong(5, r.exp);
                ps.setString(6, r.mapName);
                ps.setInt(7, r.x);
                ps.setInt(8, r.y);
                ps.setInt(9, r.dir);
                ps.setInt(10, r.hp);
                ps.setInt(11, r.mp);
                ps.setLong(12, r.gold);
                ps.setString(13, r.homeMap);
                ps.setInt(14, r.homeX);
                ps.setInt(15, r.homeY);
                ps.setString(16, ItemInstance.GSON.toJson(r.items));
                ps.setString(17, ItemInstance.GSON.toJson(r.storage));
                ps.setString(18, r.skills);
                ps.setLong(19, r.id);
                ps.executeUpdate();
            } catch (SQLException e) {
                throw new RuntimeException("update character failed", e);
            }
        }
    }

    public boolean delete(long accountId, String name) {
        Connection c = db.connection();
        synchronized (c) {
            try (PreparedStatement ps = c.prepareStatement(
                    "DELETE FROM characters WHERE account_id = ? AND name = ?")) {
                ps.setLong(1, accountId);
                ps.setString(2, name);
                return ps.executeUpdate() > 0;
            } catch (SQLException e) {
                throw new RuntimeException("delete character failed", e);
            }
        }
    }

    private CharacterRecord mapRow(ResultSet rs) throws SQLException {
        CharacterRecord r = new CharacterRecord();
        r.id = rs.getLong("id");
        r.accountId = rs.getLong("account_id");
        r.name = rs.getString("name");
        r.sex = rs.getInt("sex");
        r.hair = rs.getInt("hair");
        r.job = rs.getInt("job");
        r.level = rs.getInt("level");
        r.exp = rs.getLong("exp");
        r.mapName = rs.getString("map_name");
        r.x = rs.getInt("x");
        r.y = rs.getInt("y");
        r.dir = rs.getInt("dir");
        r.hp = rs.getInt("hp");
        r.mp = rs.getInt("mp");
        r.gold = rs.getLong("gold");
        r.homeMap = rs.getString("home_map");
        r.homeX = rs.getInt("home_x");
        r.homeY = rs.getInt("home_y");
        r.items = ItemInstance.GSON.fromJson(rs.getString("items"), ITEM_LIST_TYPE);
        if (r.items == null) {
            r.items = new ArrayList<>();
        }
        r.storage = ItemInstance.GSON.fromJson(rs.getString("storage"), ITEM_LIST_TYPE);
        if (r.storage == null) {
            r.storage = new ArrayList<>();
        }
        r.skills = rs.getString("skills");
        r.createdAt = rs.getLong("created_at");
        return r;
    }
}