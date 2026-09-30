package com.jootm2.server.resource;

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
                    list.add(new MonGenEntry(p[0], parseInt(p[1]), parseInt(p[2]),
                            p[3], parseInt(p[4]), parseInt(p[5])));
                }
            }
        } catch (IOException e) {
            System.err.println("[world] cannot read MonGen (" + e.getMessage() + ")");
        }
        return list;
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

        public MonGenEntry(String mapId, int x, int y, String monsterName, int range, int count) {
            this.mapId = mapId;
            this.x = x;
            this.y = y;
            this.monsterName = monsterName;
            this.range = range;
            this.count = count;
        }
    }
}