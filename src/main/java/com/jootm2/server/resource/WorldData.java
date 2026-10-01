package com.jootm2.server.resource;

import com.jootm2.server.game.Castle;

import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Loaders for the text configuration under Mir200/Envir (all GBK-encoded).
 */
public final class WorldData {

    private static final Charset GBK = Charset.forName("GBK");

    private WorldData() {
    }

    /** Reads the first valid {@code mapNo x y} line from StartPoint.txt. */
    public static StartPoint loadStartPoint(Path file) {
        try {
            for (String line : Files.readAllLines(file, GBK)) {
                String t = line.trim();
                if (t.isEmpty() || t.startsWith(";")) {
                    continue;
                }
                String[] p = t.split("\\s+");
                if (p.length >= 3) {
                    return new StartPoint(p[0], parseInt(p[1]), parseInt(p[2]));
                }
            }
        } catch (IOException e) {
            System.err.println("[world] no start point (" + e.getMessage() + ")");
        }
        return new StartPoint("0", 300, 300);
    }

    /** Reads {@code mapNo x y monsterName range count [interval]} spawn rows. */
    public static List<MonGenEntry> loadMonGen(Path file) {
        List<MonGenEntry> list = new ArrayList<>();
        try {
            for (String line : Files.readAllLines(file, GBK)) {
                String t = line.trim();
                if (t.isEmpty() || t.startsWith(";")) {
                    continue;
                }
                String[] p = t.split("\\s+");
                if (p.length >= 6) {
                    int interval = p.length >= 7 ? parseInt(p[6]) : 0;   // 刷怪间隔（分钟），0=默认
                    list.add(new MonGenEntry(p[0], parseInt(p[1]), parseInt(p[2]),
                            p[3], parseInt(p[4]), parseInt(p[5]), interval));
                }
            }
        } catch (IOException e) {
            System.err.println("[world] cannot read MonGen (" + e.getMessage() + ")");
        }
        return list;
    }

    /**
     * Parses {@code MapQuest.txt}: each row is
     * {@code mapId [setNumber] value monName itemName qfile [GROUP]}.
     * {@code monName}/{@code itemName} = {@code *} means "unused" (die-only or
     * pickup-only quests). Mirrors {@code TFrmDB.LoadMapQuestInfos} in LocalDB.pas.
     */
    public static List<MapQuestEntry> loadMapQuest(Path file) {
        List<MapQuestEntry> list = new ArrayList<>();
        try {
            for (String line : Files.readAllLines(file, GBK)) {
                String t = line.trim();
                if (t.isEmpty() || t.startsWith(";")) {
                    continue;
                }
                String[] p = splitQuoted(t);
                if (p.length < 6) {
                    continue;
                }
                String mapId = p[0];
                int setNumber = parseBracket(p[1]);
                int value = parseInt(p[2]);
                String monName = star(p[3]);
                String itemName = star(p[4]);
                String qfile = p[5];
                boolean group = p.length > 6 && p[6].toUpperCase().startsWith("GROUP");
                if (!mapId.isEmpty() && setNumber >= 0 && !qfile.isEmpty()) {
                    list.add(new MapQuestEntry(mapId, setNumber, value, monName, itemName, qfile, group));
                }
            }
        } catch (IOException e) {
            System.err.println("[world] cannot read MapQuest (" + e.getMessage() + ")");
        }
        return list;
    }

    /**
     * Parses {@code Castle/Sabuk.txt}: an INI-like file with
     * {@code [SetUp]} / {@code [Defense]} sections. Extracts the castle name,
     * owning guild, map, and the main door + 3 wall segments.
     */
    public static Castle loadCastle(Path file) {
        Castle c = new Castle();
        try {
            for (String line : Files.readAllLines(file, GBK)) {
                String t = line.trim();
                if (t.isEmpty() || t.startsWith(";") || t.startsWith("[")) {
                    continue;
                }
                int eq = t.indexOf('=');
                if (eq < 0) {
                    continue;
                }
                String key = t.substring(0, eq).trim();
                String val = t.substring(eq + 1).trim();
                switch (key) {
                    case "CastleName": c.name = val; break;
                    case "OwnGuild": c.ownGuild = val; break;
                    case "CastleMap": c.mapId = val; break;
                    case "MainDoorX": c.mainDoorX = parseInt(val); break;
                    case "MainDoorY": c.mainDoorY = parseInt(val); break;
                    case "MainDoorHP": c.mainDoorHp = c.mainDoorMaxHp = parseInt(val); break;
                    case "MainDoorOpen": c.mainDoorOpen = parseInt(val) != 0; break;
                    case "LeftWallX": c.wallX[0] = parseInt(val); break;
                    case "LeftWallY": c.wallY[0] = parseInt(val); break;
                    case "LeftWallHP": c.wallHp[0] = c.wallMaxHp[0] = parseInt(val); break;
                    case "CenterWallX": c.wallX[1] = parseInt(val); break;
                    case "CenterWallY": c.wallY[1] = parseInt(val); break;
                    case "CenterWallHP": c.wallHp[1] = c.wallMaxHp[1] = parseInt(val); break;
                    case "RightWallX": c.wallX[2] = parseInt(val); break;
                    case "RightWallY": c.wallY[2] = parseInt(val); break;
                    case "RightWallHP": c.wallHp[2] = c.wallMaxHp[2] = parseInt(val); break;
                    default: break;
                }
            }
        } catch (IOException e) {
            System.err.println("[world] cannot read castle (" + e.getMessage() + ")");
        }
        return c;
    }

    /** "[401]" -> 401 (or plain number). */
    private static int parseBracket(String s) {
        if (s == null) {
            return -1;
        }
        String t = s.trim();
        if (t.startsWith("[") && t.endsWith("]")) {
            t = t.substring(1, t.length() - 1);
        }
        return parseInt(t);
    }

    /** "*" or empty means "unused". */
    private static String star(String s) {
        if (s == null) {
            return "";
        }
        String t = s.trim();
        return (t.isEmpty() || t.equals("*")) ? "" : t;
    }

    /** Whitespace split honouring double-quoted (spaced) fields. */
    private static String[] splitQuoted(String line) {
        List<String> out = new ArrayList<>();
        int i = 0;
        int n = line.length();
        while (i < n) {
            while (i < n && Character.isWhitespace(line.charAt(i))) {
                i++;
            }
            if (i >= n) {
                break;
            }
            if (line.charAt(i) == '"') {
                int end = line.indexOf('"', i + 1);
                if (end < 0) {
                    out.add(line.substring(i));
                    break;
                }
                out.add(line.substring(i + 1, end));
                i = end + 1;
            } else {
                int start = i;
                while (i < n && !Character.isWhitespace(line.charAt(i))) {
                    i++;
                }
                out.add(line.substring(start, i));
            }
        }
        return out.toArray(new String[0]);
    }

    private static int parseInt(String s) {
        try {
            return Integer.parseInt(s.trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /**
     * Parses {@code MapInfo.txt}, which mixes map definitions
     * ({@code [mapId<TAB>name] [flags...]}) with gate rows
     * ({@code srcMap srcX,srcY -> dstMap dstX,dstY}).
     */
    public static MapInfo loadMapInfo(Path file) {
        Map<String, MapDef> maps = new HashMap<>();
        List<Gate> gates = new ArrayList<>();
        try {
            for (String line : Files.readAllLines(file, GBK)) {
                String t = line.trim();
                if (t.isEmpty() || t.startsWith(";")) {
                    continue;
                }
                if (t.startsWith("[")) {
                    int close = t.indexOf(']');
                    if (close < 0) {
                        continue;
                    }
                    String inner = t.substring(1, close).trim();
                    String[] kv = inner.split("\\s+", 2);
                    String mapId = kv[0].trim();
                    String name = kv.length > 1 ? kv[1].trim() : mapId;
                    boolean safe = t.toUpperCase().contains("SAFE");
                    maps.put(mapId, new MapDef(mapId, name, safe));
                } else if (t.contains("->")) {
                    String[] sides = t.split("->", 2);
                    if (sides.length < 2) {
                        continue;
                    }
                    String[] src = sides[0].trim().split("\\s+");
                    String[] dst = sides[1].trim().split("\\s+");
                    if (src.length < 2 || dst.length < 2) {
                        continue;
                    }
                    int[] sxy = parseXY(src[1]);
                    int[] dxy = parseXY(dst[1]);
                    gates.add(new Gate(src[0].trim(), sxy[0], sxy[1],
                            dst[0].trim(), dxy[0], dxy[1]));
                }
            }
        } catch (IOException e) {
            System.err.println("[world] cannot read MapInfo (" + e.getMessage() + ")");
        }
        return new MapInfo(maps, gates);
    }

    private static int[] parseXY(String coord) {
        String[] p = coord.split(",", 2);
        int x = p.length > 0 ? parseInt(p[0]) : 0;
        int y = p.length > 1 ? parseInt(p[1]) : 0;
        return new int[]{x, y};
    }

    /**
     * Parses a {@code MonItems/{monster}.txt} drop table: each row is
     * {@code n/m  itemName  [count]}. {@code selPoint = n-1}, {@code maxPoint = m},
     * the item drops when {@code selPoint >= random(maxPoint)}.
     */
    public static List<DropEntry> loadMonItems(Path file) {
        List<DropEntry> list = new ArrayList<>();
        try {
            for (String line : Files.readAllLines(file, GBK)) {
                String t = line.trim();
                if (t.isEmpty() || t.startsWith(";")) {
                    continue;
                }
                String[] tokens = t.split("\\s+");
                if (tokens.length < 2) {
                    continue;
                }
                String[] prob = tokens[0].split("/");
                if (prob.length != 2) {
                    continue;
                }
                int n = parseInt(prob[0]);
                int m = parseInt(prob[1]);
                String name = tokens[1];
                int count = tokens.length > 2 ? parseInt(tokens[2]) : 1;
                if (n > 0 && m > 0 && !name.isEmpty()) {
                    list.add(new DropEntry(n - 1, m, name, count));
                }
            }
        } catch (IOException e) {
            System.err.println("[world] cannot read MonItems (" + e.getMessage() + ")");
        }
        return list;
    }

    public static final class MapDef {
        public final String mapId;
        public final String name;
        public final boolean safe;

        public MapDef(String mapId, String name, boolean safe) {
            this.mapId = mapId;
            this.name = name;
            this.safe = safe;
        }
    }

    public static final class Gate {
        public final String srcMap;
        public final int srcX;
        public final int srcY;
        public final String dstMap;
        public final int dstX;
        public final int dstY;

        public Gate(String srcMap, int srcX, int srcY, String dstMap, int dstX, int dstY) {
            this.srcMap = srcMap;
            this.srcX = srcX;
            this.srcY = srcY;
            this.dstMap = dstMap;
            this.dstX = dstX;
            this.dstY = dstY;
        }
    }

    public static final class MapInfo {
        public final Map<String, MapDef> maps;
        public final List<Gate> gates;

        public MapInfo(Map<String, MapDef> maps, List<Gate> gates) {
            this.maps = maps;
            this.gates = gates;
        }
    }

    public static final class StartPoint {
        public final String mapId;
        public final int x;
        public final int y;

        public StartPoint(String mapId, int x, int y) {
            this.mapId = mapId;
            this.x = x;
            this.y = y;
        }
    }

    public static final class MonGenEntry {
        public final String mapId;
        public final int x;
        public final int y;
        public final String monsterName;
        public final int range;
        public final int count;
        public final int intervalMin;   // 刷怪间隔（分钟），0 = 用默认重生时间

        public MonGenEntry(String mapId, int x, int y, String monsterName, int range, int count, int intervalMin) {
            this.mapId = mapId;
            this.x = x;
            this.y = y;
            this.monsterName = monsterName;
            this.range = range;
            this.count = count;
            this.intervalMin = intervalMin;
        }
    }

    /** One MapQuest.txt row: a quest triggered by killing/picking up on a map. */
    public static final class MapQuestEntry {
        public final String mapId;
        public final int setNumber;   // 旗标号（触发条件：玩家旗标 == value）
        public final int value;       // 旗标值
        public final String monName;  // 怪物名（"" = 不按杀怪触发）
        public final String itemName; // 物品名（"" = 不按捡物触发）
        public final String qfile;    // MapQuest_Def 脚本文件名
        public final boolean enableGroup;

        public MapQuestEntry(String mapId, int setNumber, int value, String monName,
                             String itemName, String qfile, boolean enableGroup) {
            this.mapId = mapId;
            this.setNumber = setNumber;
            this.value = value;
            this.monName = monName;
            this.itemName = itemName;
            this.qfile = qfile;
            this.enableGroup = enableGroup;
        }
    }

    /** One drop-table row ({@code selPoint = n-1}, {@code maxPoint = m}). */
    public static final class DropEntry {
        public final int selPoint;
        public final int maxPoint;
        public final String itemName;
        public final int count;

        public DropEntry(int selPoint, int maxPoint, String itemName, int count) {
            this.selPoint = selPoint;
            this.maxPoint = maxPoint;
            this.itemName = itemName;
            this.count = count;
        }
    }
}