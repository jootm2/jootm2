package com.jootm2.server.resource;

import com.jootm2.server.game.npc.NpcScript;

import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Loaders for NPC placement ({@code Npcs.txt}, {@code MerChant.txt}) and NPC
 * scripts ({@code Npc_Def/}, {@code Market_Def/}). All text is GBK. Mirrors
 * {@code TFrmDB.LoadNpcs / LoadMerchants / LoadNpcDef / LoadMarketDef}.
 */
public final class NpcData {

    private static final Charset GBK = Charset.forName("GBK");

    private NpcData() {
    }

    /** Placement descriptor; a {@link com.jootm2.server.game.npc.Npc} is built from it. */
    public static final class Spawn {
        public String name;         // display name (seller) or Npcs.txt name
        public String scriptName;   // script file base name
        public int kind;            // Npcs.txt race code
        public String mapId;
        public int x;
        public int y;
        public int face;
        public int appearance;
        public boolean merchant;
    }

    /** Parses {@code name race map x y face body} rows. */
    public static List<Spawn> loadNpcs(Path file) {
        List<Spawn> list = new ArrayList<>();
        List<String[]> rows = readRows(file);
        for (String[] p : rows) {
            if (p.length < 7) {
                continue;
            }
            Spawn s = new Spawn();
            s.name = p[0];
            s.scriptName = p[0];
            s.kind = parseInt(p[1], 0);
            s.mapId = p[2];
            s.x = parseInt(p[3], 0);
            s.y = parseInt(p[4], 0);
            s.face = parseInt(p[5], 0);
            s.appearance = parseInt(p[6], 0);
            s.merchant = false;
            list.add(s);
        }
        return list;
    }

    /** Parses {@code market map x y seller face appearance castle} rows. */
    public static List<Spawn> loadMerchants(Path file) {
        List<Spawn> list = new ArrayList<>();
        List<String[]> rows = readRows(file);
        for (String[] p : rows) {
            if (p.length < 7) {
                continue;
            }
            Spawn s = new Spawn();
            s.scriptName = p[0];
            s.mapId = p[1];
            s.x = parseInt(p[2], 0);
            s.y = parseInt(p[3], 0);
            s.name = p[4];
            s.face = parseInt(p[5], 0);
            s.appearance = parseInt(p[6], 0);
            s.kind = 0;
            s.merchant = true;
            list.add(s);
        }
        return list;
    }

    /** Loads a script for {@code name} on {@code mapId}, case-insensitive, with fallback. */
    public static NpcScript loadScript(Path dir, String name, String mapId) {
        Path exact = dir.resolve(name + "-" + mapId + ".txt");
        if (Files.exists(exact)) {
            return parse(exact);
        }
        Path base = dir.resolve(name + ".txt");
        if (Files.exists(base)) {
            return parse(base);
        }
        // case-insensitive scan for {name}-{mapId}.txt
        String wantLower = (name + "-" + mapId + ".txt").toLowerCase();
        if (Files.isDirectory(dir)) {
            try (DirectoryStream<Path> ds = Files.newDirectoryStream(dir)) {
                for (Path p : ds) {
                    if (p.getFileName().toString().toLowerCase().equals(wantLower)) {
                        return parse(p);
                    }
                }
            } catch (IOException ignored) {
            }
        }
        return null;
    }

    private static NpcScript parse(Path file) {
        try {
            return NpcScript.parse(Files.readAllLines(file, GBK));
        } catch (IOException e) {
            System.err.println("[npc] cannot read script " + file + ": " + e.getMessage());
            return null;
        }
    }

    private static List<String[]> readRows(Path file) {
        List<String[]> rows = new ArrayList<>();
        try {
            for (String line : Files.readAllLines(file, GBK)) {
                String t = line.trim();
                if (t.isEmpty() || t.startsWith(";")) {
                    continue;
                }
                rows.add(split(t));
            }
        } catch (IOException e) {
            System.err.println("[npc] cannot read " + file + ": " + e.getMessage());
        }
        return rows;
    }

    /** Whitespace split honouring double-quoted fields. */
    private static String[] split(String line) {
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

    private static int parseInt(String s, int def) {
        try {
            return Integer.parseInt(s.trim());
        } catch (Exception e) {
            return def;
        }
    }
}
