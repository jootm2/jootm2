package com.jootm2.server.db;

import com.jootm2.server.game.common.ItemTemplate;
import com.jootm2.server.game.common.MagicTemplate;
import com.jootm2.server.game.common.MonsterTemplate;
import com.jootm2.server.resource.ParadoxDb;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Ownership &amp; lifecycle of the single SQLite connection.
 *
 * Replaces both the BDE tables (StdItems/Monster) and the file based FDB store
 * used by the original DBSrv200 process. All access to the JDBC connection is
 * funnelled through the synchronized helpers below so the server can run a
 * single lightweight connection safely.
 */
public final class Database implements AutoCloseable {

    private final Connection connection;

    public Database(String dbFile) throws SQLException {
        File f = new File(dbFile);
        File parent = f.getParentFile();
        if (parent != null && !parent.exists()) {
            boolean created = parent.mkdirs();
            if (!created && !parent.exists()) {
                throw new SQLException("Cannot create data directory: " + parent);
            }
        }
        this.connection = DriverManager.getConnection("jdbc:sqlite:" + dbFile);
        initSchema();
    }

    private void initSchema() throws SQLException {
        try (Statement st = connection.createStatement()) {
            st.executeUpdate("PRAGMA journal_mode=WAL;");
            st.executeUpdate("PRAGMA foreign_keys=ON;");
            st.executeUpdate("CREATE TABLE IF NOT EXISTS accounts (" +
                    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                    "username TEXT NOT NULL UNIQUE," +
                    "password_hash TEXT NOT NULL," +
                    "salt TEXT NOT NULL," +
                    "created_at INTEGER NOT NULL," +
                    "last_login INTEGER)");
            st.executeUpdate("CREATE TABLE IF NOT EXISTS characters (" +
                    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                    "account_id INTEGER NOT NULL," +
                    "name TEXT NOT NULL UNIQUE," +
                    "sex INTEGER NOT NULL DEFAULT 0," +
                    "hair INTEGER NOT NULL DEFAULT 0," +
                    "job INTEGER NOT NULL DEFAULT 0," +
                    "level INTEGER NOT NULL DEFAULT 1," +
                    "exp INTEGER NOT NULL DEFAULT 0," +
                    "map_name TEXT NOT NULL DEFAULT 'default'," +
                    "x INTEGER NOT NULL DEFAULT 0," +
                    "y INTEGER NOT NULL DEFAULT 0," +
                    "dir INTEGER NOT NULL DEFAULT 0," +
                    "hp INTEGER NOT NULL DEFAULT 0," +
                    "mp INTEGER NOT NULL DEFAULT 0," +
                    "gold INTEGER NOT NULL DEFAULT 0," +
                    "home_map TEXT NOT NULL DEFAULT 'default'," +
                    "home_x INTEGER NOT NULL DEFAULT 0," +
                    "home_y INTEGER NOT NULL DEFAULT 0," +
                    "items TEXT NOT NULL DEFAULT '[]'," +
                    "storage TEXT NOT NULL DEFAULT '[]'," +
                    "skills TEXT NOT NULL DEFAULT '[]'," +
                    "created_at INTEGER NOT NULL," +
                    "FOREIGN KEY (account_id) REFERENCES accounts(id))");
            // 迁移：旧库补 storage 列
            try {
                st.executeUpdate("ALTER TABLE characters ADD COLUMN storage TEXT NOT NULL DEFAULT '[]'");
            } catch (SQLException ignored) {
                // 列已存在
            }
            st.executeUpdate("CREATE TABLE IF NOT EXISTS std_items (" +
                    "idx INTEGER PRIMARY KEY," +
                    "data TEXT NOT NULL)");
            st.executeUpdate("CREATE TABLE IF NOT EXISTS monsters (" +
                    "name TEXT PRIMARY KEY," +
                    "data TEXT NOT NULL)");
            st.executeUpdate("CREATE TABLE IF NOT EXISTS magics (" +
                    "mag_id INTEGER PRIMARY KEY," +
                    "data TEXT NOT NULL)");
        }
    }

    /** Inserts a small playable starter set the first time the database is created. */
    private void seedDefaults() throws SQLException {
        if (count("std_items") > 0 || count("monsters") > 0) {
            return;
        }

        ItemTemplate[] items = {
                DbUtil.defaultWoodenSword(),      // idx 0
                DbUtil.defaultClothArmour(),      // idx 1
                DbUtil.defaultHealingPotion(),    // idx 2
                DbUtil.defaultManaPotion()        // idx 3
        };
        for (int i = 0; i < items.length; i++) {
            insertStdItem(i, items[i]);
        }

        MonsterTemplate[] mons = {
                DbUtil.defaultChicken(),
                DbUtil.defaultDeer(),
                DbUtil.defaultScarecrow()
        };
        for (MonsterTemplate m : mons) {
            insertMonster(m);
        }
    }

    /**
     * Populates the template tables once. When the Paradox tables exist under
     * mud2/DB they win (the authoritative game data); otherwise a tiny starter
     * set keeps the server playable.
     */
    public void seedGameData(Path mud2Dir) throws SQLException {
        if (count("std_items") > 0) {
            return;
        }
        boolean ok = false;
        if (mud2Dir != null && Files.exists(mud2Dir.resolve("StdItems.DB"))) {
            ok = importParadox(mud2Dir);
        }
        if (!ok) {
            seedDefaults();
        }
    }

    private boolean importParadox(Path mud2Dir) {
        try {
            ParadoxDb std = ParadoxDb.read(mud2Dir.resolve("StdItems.DB"));
            ParadoxDb mons = ParadoxDb.read(mud2Dir.resolve("Monster.DB"));

            try (Statement st = connection.createStatement()) {
                st.executeUpdate("DELETE FROM std_items");
                st.executeUpdate("DELETE FROM monsters");
                st.executeUpdate("DELETE FROM magics");
            }

            for (Object[] r : std.records) {
                insertStdItem(num(r[0]), mapStdItem(r));
            }
            for (Object[] r : mons.records) {
                insertMonster(mapMonster(r));
            }
            Path magicFile = mud2Dir.resolve("Magic.DB");
            if (Files.exists(magicFile)) {
                for (Object[] r : ParadoxDb.read(magicFile).records) {
                    insertMagic(mapMagic(r));
                }
            }
            System.out.println("[db] imported Paradox: items=" + std.records.size()
                    + ", monsters=" + mons.records.size());
            return std.records.size() > 0;
        } catch (Exception e) {
            System.err.println("[db] failed to import Paradox tables: " + e.getMessage());
            return false;
        }
    }

    private static ItemTemplate mapStdItem(Object[] r) {
        ItemTemplate t = new ItemTemplate();
        t.name = (String) r[1];
        t.stdMode = num(r[2]);
        t.shape = num(r[3]);
        t.weight = num(r[4]);
        t.aniCount = num(r[5]);
        t.specialPwr = num(r[6]);
        t.itemDesc = num(r[7]);
        t.looks = num(r[8]);
        t.duraMax = num(r[9]);
        t.acMin = num(r[10]);
        t.acMax = num(r[11]);
        t.macMin = num(r[12]);
        t.macMax = num(r[13]);
        t.dcMin = num(r[14]);
        t.dcMax = num(r[15]);
        t.mcMin = num(r[16]);
        t.mcMax = num(r[17]);
        t.scMin = num(r[18]);
        t.scMax = num(r[19]);
        t.need = num(r[20]);
        t.needLevel = num(r[21]);
        t.price = num(r[22]);
        t.stock = num(r[23]);
        return t;
    }

    private static MonsterTemplate mapMonster(Object[] r) {
        MonsterTemplate m = new MonsterTemplate();
        m.name = (String) r[0];
        m.race = num(r[1]);
        m.raceImg = num(r[2]);
        m.appr = num(r[3]);
        m.level = num(r[4]);
        m.coolEye = num(r[6]);
        m.exp = num(r[7]);
        m.hp = num(r[8]);
        m.mp = num(r[9]);
        m.ac = num(r[10]);
        m.mac = num(r[11]);
        m.dc = num(r[12]);
        m.maxDc = num(r[13]);
        m.mc = num(r[14]);
        m.sc = num(r[15]);
        m.speed = num(r[16]);
        m.hit = num(r[17]);
        m.walkSpeed = num(r[18]);
        m.attackSpeed = num(r[21]);
        return m;
    }

    private static MagicTemplate mapMagic(Object[] r) {
        MagicTemplate m = new MagicTemplate();
        m.magId = num(r[0]);
        m.name = (String) r[1];
        for (int i = 2; i < r.length; i++) {
            Object v = r[i];
            if (v instanceof String) {
                m.attrs.add((String) v);
            } else if (v instanceof Number) {
                m.attrs.add(((Number) v).intValue());
            }
        }
        return m;
    }

    private void insertMagic(MagicTemplate m) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement(
                "INSERT OR REPLACE INTO magics (mag_id, data) VALUES (?, ?)")) {
            ps.setInt(1, m.magId);
            ps.setString(2, m.serialize());
            ps.executeUpdate();
        }
    }

    public Map<Integer, MagicTemplate> loadMagicTemplates() throws SQLException {
        Map<Integer, MagicTemplate> map = new LinkedHashMap<>();
        synchronized (connection) {
            try (Statement st = connection.createStatement();
                 ResultSet rs = st.executeQuery("SELECT mag_id, data FROM magics ORDER BY mag_id")) {
                while (rs.next()) {
                    MagicTemplate m = MagicTemplate.deserialize(rs.getString(2));
                    m.resolve();
                    map.put(rs.getInt(1), m);
                }
            }
        }
        return map;
    }

    private static int num(Object v) {
        return (v instanceof Number) ? ((Number) v).intValue() : 0;
    }

    private void insertStdItem(int idx, ItemTemplate item) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement(
                "INSERT OR REPLACE INTO std_items (idx, data) VALUES (?, ?)")) {
            ps.setInt(1, idx);
            ps.setString(2, ItemTemplate.GSON.toJson(item));
            ps.executeUpdate();
        }
    }

    private void insertMonster(MonsterTemplate m) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement(
                "INSERT OR REPLACE INTO monsters (name, data) VALUES (?, ?)")) {
            ps.setString(1, m.name);
            ps.setString(2, m.serialize());
            ps.executeUpdate();
        }
    }

    private int count(String table) throws SQLException {
        try (Statement st = connection.createStatement();
             ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM " + table)) {
            return rs.next() ? rs.getInt(1) : 0;
        }
    }

    public Map<Integer, ItemTemplate> loadItemTemplates() throws SQLException {
        Map<Integer, ItemTemplate> map = new LinkedHashMap<>();
        synchronized (connection) {
            try (Statement st = connection.createStatement();
                 ResultSet rs = st.executeQuery("SELECT idx, data FROM std_items ORDER BY idx")) {
                while (rs.next()) {
                    ItemTemplate t = ItemTemplate.fromJson(rs.getString(2));
                    t.index = rs.getInt(1);
                    map.put(t.index, t);
                }
            }
        }
        return map;
    }

    public Map<String, MonsterTemplate> loadMonsterTemplates() throws SQLException {
        Map<String, MonsterTemplate> map = new LinkedHashMap<>();
        synchronized (connection) {
            try (Statement st = connection.createStatement();
                 ResultSet rs = st.executeQuery("SELECT name, data FROM monsters")) {
                while (rs.next()) {
                    map.put(rs.getString(1), MonsterTemplate.deserialize(rs.getString(2)));
                }
            }
        }
        return map;
    }

    public Connection connection() {
        return connection;
    }

    @Override
    public void close() throws SQLException {
        connection.close();
    }
}