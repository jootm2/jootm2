package com.jootm2.server.db;

import com.jootm2.server.game.common.ItemInstance;
import com.jootm2.server.game.common.ItemTemplate;
import com.jootm2.server.game.common.MonsterTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;

/**
 * Shared helpers for the SQLite persistence layer.
 */
final class DbUtil {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final char[] HEX = "0123456789abcdef".toCharArray();

    private DbUtil() {
    }

    static String newSalt() {
        byte[] b = new byte[16];
        RANDOM.nextBytes(b);
        return toHex(b);
    }

    /** SHA-256(salt + password) -> lowercase hex. */
    static String hashPassword(String salt, String password) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] data = (salt + password).getBytes(StandardCharsets.UTF_8);
            return toHex(md.digest(data));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    static String toHex(byte[] data) {
        char[] out = new char[data.length * 2];
        for (int i = 0; i < data.length; i++) {
            int v = data[i] & 0xFF;
            out[i * 2] = HEX[v >>> 4];
            out[i * 2 + 1] = HEX[v & 0x0F];
        }
        return new String(out);
    }

    static ItemTemplate defaultWoodenSword() {
        ItemTemplate t = new ItemTemplate();
        t.name = "木剑";
        t.stdMode = 5;          // weapon
        t.shape = 1;
        t.weight = 6;
        t.looks = 117;
        t.duraMax = 3000;
        t.dcMin = 2;
        t.dcMax = 5;
        t.need = 0;
        t.needLevel = 1;
        t.price = 100;
        return t;
    }

    static ItemTemplate defaultClothArmour() {
        ItemTemplate t = new ItemTemplate();
        t.name = "布衣";
        t.stdMode = 10;         // armour
        t.shape = 1;
        t.weight = 8;
        t.looks = 0;
        t.duraMax = 3000;
        t.acMin = 2;
        t.acMax = 2;
        t.macMin = 0;
        t.macMax = 1;
        t.need = 0;
        t.needLevel = 1;
        t.price = 50;
        return t;
    }

    static ItemTemplate defaultHealingPotion() {
        ItemTemplate t = new ItemTemplate();
        t.name = "金创药(小)";
        t.stdMode = 0;          // consumable
        t.shape = 0;
        t.weight = 1;
        t.looks = 81;
        t.duraMax = 1;
        t.hpAdd = 30;
        t.need = 0;
        t.needLevel = 0;
        t.price = 20;
        return t;
    }

    static ItemTemplate defaultManaPotion() {
        ItemTemplate t = new ItemTemplate();
        t.name = "魔法药(小)";
        t.stdMode = 0;
        t.shape = 0;
        t.weight = 1;
        t.looks = 82;
        t.duraMax = 1;
        t.mpAdd = 20;
        t.need = 0;
        t.needLevel = 0;
        t.price = 20;
        return t;
    }

    static MonsterTemplate defaultChicken() {
        MonsterTemplate m = new MonsterTemplate();
        m.name = "鸡";
        m.race = 80;
        m.appr = 46;
        m.level = 1;
        m.exp = 10;
        m.hp = 8;
        m.mp = 0;
        m.ac = 0;
        m.mac = 0;
        m.dc = 1;
        m.maxDc = 2;
        m.speed = 3;
        m.hit = 5;
        m.walkSpeed = 800;
        m.attackSpeed = 1000;
        return m;
    }

    static MonsterTemplate defaultDeer() {
        MonsterTemplate m = new MonsterTemplate();
        m.name = "鹿";
        m.race = 52;
        m.appr = 24;
        m.level = 2;
        m.exp = 20;
        m.hp = 15;
        m.mp = 0;
        m.ac = 1;
        m.mac = 0;
        m.dc = 1;
        m.maxDc = 3;
        m.speed = 3;
        m.hit = 5;
        m.walkSpeed = 700;
        m.attackSpeed = 1000;
        return m;
    }

    static MonsterTemplate defaultScarecrow() {
        MonsterTemplate m = new MonsterTemplate();
        m.name = "稻草人";
        m.race = 80;
        m.appr = 20;
        m.level = 3;
        m.exp = 40;
        m.hp = 30;
        m.mp = 0;
        m.ac = 0;
        m.mac = 0;
        m.dc = 2;
        m.maxDc = 5;
        m.speed = 3;
        m.hit = 6;
        m.walkSpeed = 800;
        m.attackSpeed = 1200;
        return m;
    }

    static ItemInstance newItemInstance(int makeIndex, ItemTemplate template) {
        return new ItemInstance(makeIndex, 0, template.duraMax, template.duraMax);
    }
}