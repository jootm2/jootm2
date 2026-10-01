package com.jootm2.server.game.npc;

import com.jootm2.server.game.GameMap;
import com.jootm2.server.game.GameWorld;
import com.jootm2.server.game.Player;
import com.jootm2.server.game.common.ItemTemplate;

import java.util.ArrayList;
import java.util.List;

/**
 * Executes a {@link NpcScript} on behalf of a talking player. Mirrors the
 * conditional / action semantics of {@code TNormNpc.NpcSayTitle} (ObjNpc.pas)
 * for the common command subset. Unsupported commands are ignored so scripts
 * keep flowing.
 */
public final class NpcScriptEngine {

    private static final int MAX_DEPTH = 64;

    private final GameWorld world;

    public NpcScriptEngine(GameWorld world) {
        this.world = world;
    }

    /** Outcome of one conversation turn, serialised into JSON by GameService. */
    public static final class Result {
        public String sayText = "";
        public final List<Option> options = new ArrayList<>();
        public boolean closed;
        public boolean moved;
        public GameMap movedMap;
        public int movedX;
        public int movedY;
        public String shopMode;   // null | "buy" | "sell"
    }

    public static final class Option {
        public final String label;
        public final String value;

        public Option(String label, String value) {
            this.label = label;
            this.value = value;
        }
    }

    public Result execute(Player p, Npc npc, String startLabel) {
        return executeScript(p, npc, npc.script, startLabel);
    }

    /** Executes an arbitrary script (used for MapQuest scripts without a live Npc). */
    public Result executeScript(Player p, Npc npc, NpcScript script, String startLabel) {
        Result r = new Result();
        String label = startLabel == null ? "main" : startLabel;
        if (label.startsWith("@")) {
            label = label.substring(1);
        }
        int depth = 0;
        while (label != null && depth++ < MAX_DEPTH) {
            NpcScript.Section sec = script == null ? null : script.section(label);
            if (sec == null) {
                break;
            }
            String ctrl = runSection(p, npc, sec, r);
            if (r.closed || r.moved) {
                break;
            }
            if (ctrl != null && ctrl.startsWith("@")) {
                label = ctrl.substring(1);
            } else if ("BREAK".equals(ctrl)) {
                break;
            } else {
                break;   // end of branch / plain say
            }
        }
        return r;
    }

    private String runSection(Player p, Npc npc, NpcScript.Section sec, Result r) {
        for (NpcScript.Stmt stmt : sec.stmts) {
            if (stmt instanceof NpcScript.TextStmt) {
                appendSay(r, ((NpcScript.TextStmt) stmt).text, p);
            } else if (stmt instanceof NpcScript.IfStmt) {
                NpcScript.IfStmt ifs = (NpcScript.IfStmt) stmt;
                boolean ok = evalConditions(p, npc, ifs.conditions);
                if (ok) {
                    if (ifs.sayText != null) {
                        appendSay(r, ifs.sayText, p);
                    }
                    String ctrl = runActions(p, npc, ifs.actions, r);
                    if (ctrl != null) {
                        return ctrl;
                    }
                } else {
                    if (ifs.elseSayText != null) {
                        appendSay(r, ifs.elseSayText, p);
                    }
                    String ctrl = runActions(p, npc, ifs.elseActions, r);
                    if (ctrl != null) {
                        return ctrl;
                    }
                }
            }
        }
        return null;
    }

    // -- text rendering -----------------------------------------------------

    private void appendSay(Result r, String raw, Player p) {
        String text = raw.replace("\\", "\n");
        text = text.replace("<$USERNAME>", p.name);
        text = text.replace("<$USERGOLD>", String.valueOf(p.gold));
        // extract <label/@tag> links
        StringBuilder clean = new StringBuilder();
        int i = 0;
        while (i < text.length()) {
            int lt = text.indexOf('<', i);
            if (lt < 0) {
                clean.append(text, i, text.length());
                break;
            }
            int gt = text.indexOf('>', lt);
            if (gt < 0) {
                clean.append(text, i, text.length());
                break;
            }
            clean.append(text, i, lt);
            String inner = text.substring(lt + 1, gt);
            int at = inner.indexOf('@');
            if (at >= 0) {
                String label = inner.substring(0, at);
                while (label.endsWith("/") || label.endsWith(" ")) {
                    label = label.substring(0, label.length() - 1);
                }
                String value = inner.substring(at);
                if (!label.isEmpty()) {
                    r.options.add(new Option(label, value));
                }
            } else {
                clean.append(inner);
            }
            i = gt + 1;
        }
        String out = clean.toString();
        if (!out.isBlank()) {
            if (!r.sayText.isEmpty()) {
                r.sayText += "\n";
            }
            r.sayText += out.trim();
        }
    }

    // -- conditions ---------------------------------------------------------

    private boolean evalConditions(Player p, Npc npc, List<NpcScript.Cmd> conds) {
        for (NpcScript.Cmd c : conds) {
            if (!evalCondition(p, npc, c)) {
                return false;
            }
        }
        return true;
    }

    private boolean evalCondition(Player p, Npc npc, NpcScript.Cmd c) {
        switch (c.name.toLowerCase()) {
            case "checkgold":
                return p.gold >= c.paramInt(0);
            case "checklevel":
                return p.level >= c.paramInt(0);
            case "checkitem":
                return world.countItem(p, c.param) >= c.tagInt(1);
            case "checkitemw":
                return world.countItem(p, c.param) >= c.tagInt(1);
            case "checkpkpoint":
                return p.pkPoint >= c.paramInt(0);
            case "checkjob":
                return matchesJob(p.job, c.param);
            case "gender":
                return "MAN".equalsIgnoreCase(c.param) ? p.sex == 0 : p.sex == 1;
            case "check":
                return p.questParams[questIndex(c.param)] >= c.tagInt(0);
            case "equal":
                return p.questParams[questIndex(c.param)] == c.tagInt(0);
            case "large":
                return p.questParams[questIndex(c.param)] > c.tagInt(0);
            case "small":
                return p.questParams[questIndex(c.param)] < c.tagInt(0);
            case "random":
                // Delphi: Random(n) = 0 才通过（random 5 = 1/5 概率）
                return c.paramInt(0) <= 0 || (int) (Math.random() * c.paramInt(0)) == 0;
            default:
                return true;   // unsupported condition passes
        }
    }

    private boolean matchesJob(int job, String param) {
        String s = param.toLowerCase();
        if (s.startsWith("war")) {
            return job == 0;
        }
        if (s.startsWith("wiz")) {
            return job == 1;
        }
        if (s.startsWith("tao")) {
            return job == 2;
        }
        return true;
    }

    private int questIndex(String param) {
        String s = param == null ? "" : param.trim();
        if (s.startsWith("[") && s.endsWith("]")) {
            s = s.substring(1, s.length() - 1);
        }
        try {
            int n = Integer.parseInt(s);
            return n >= 0 && n < 1000 ? n : 0;
        } catch (Exception e) {
            return 0;
        }
    }

    // -- actions ------------------------------------------------------------

    private String runActions(Player p, Npc npc, List<NpcScript.Cmd> acts, Result r) {
        for (NpcScript.Cmd c : acts) {
            String ctrl = runAction(p, npc, c, r);
            if (ctrl != null) {
                return ctrl;
            }
        }
        return null;
    }

    private String runAction(Player p, Npc npc, NpcScript.Cmd c, Result r) {
        switch (c.name.toLowerCase()) {
            case "take":
                world.takeItems(p, c.param, c.tagInt(1));
                return null;
            case "give":
                world.giveItem(p, c.param, c.tagInt(1));
                return null;
            case "takew":
                world.takeItems(p, c.param, c.tagInt(1));
                return null;
            case "set":
                p.questParams[questIndex(c.param)] = c.tagInt(0);
                return null;
            case "reset":
                p.questParams[questIndex(c.param)] = 0;
                return null;
            case "inc":
                p.questParams[questIndex(c.param)] += 1;
                return null;
            case "dec":
                p.questParams[questIndex(c.param)] -= 1;
                return null;
            case "mapmove":
                doMapMove(p, c, r);
                return "BREAK";
            case "goto":
                return c.param.startsWith("@") ? c.param : "@" + c.param;
            case "break":
                return "BREAK";
            case "close":
                r.closed = true;
                return "BREAK";
            case "buy":
                r.shopMode = "buy";
                return "BREAK";
            case "sell":
                r.shopMode = "sell";
                return "BREAK";
            default:
                return null;   // unsupported action ignored
        }
    }

    private void doMapMove(Player p, NpcScript.Cmd c, Result r) {
        String mapId = c.param.trim();
        GameMap target = world.getOrLoadMap(mapId);
        if (target == null) {
            target = p.map;
        }
        int x = c.tagInt(Integer.MIN_VALUE);
        int y = c.extraInt(Integer.MIN_VALUE);
        if (x == Integer.MIN_VALUE || y == Integer.MIN_VALUE) {
            int[] free = target.randomFreeCell();
            x = free[0];
            y = free[1];
        }
        GameMap moved = world.changeMap(p, mapId, x, y);
        if (moved != null) {
            r.moved = true;
            r.movedMap = moved;
            r.movedX = x;
            r.movedY = y;
        }
    }

    /** Builds the shop goods list from the NPC's [goods] section (buy only). */
    public List<GoodsEntry> goods(Npc npc) {
        List<GoodsEntry> list = new ArrayList<>();
        if (npc.script == null) {
            return list;
        }
        NpcScript.Section sec = npc.script.section("goods");
        if (sec == null) {
            return list;
        }
        for (NpcScript.Stmt s : sec.stmts) {
            if (!(s instanceof NpcScript.TextStmt)) {
                continue;
            }
            for (String line : ((NpcScript.TextStmt) s).text.split("\n")) {
                String t = line.trim();
                if (t.isEmpty() || t.startsWith(";")) {
                    continue;
                }
                // 物品名  价格  数量
                String[] parts = t.split("\\s+");
                if (parts.length < 2) {
                    continue;
                }
                String name = parts[0];
                int price = parseInt(parts[1], 0);
                int stock = parts.length > 2 ? parseInt(parts[2], 0) : 0;
                ItemTemplate tmpl = world.itemTemplateByName(name);
                if (tmpl != null) {
                    list.add(new GoodsEntry(name, tmpl.index, price, stock));
                }
            }
        }
        return list;
    }

    public static final class GoodsEntry {
        public final String name;
        public final int index;
        public final int price;
        public final int stock;

        public GoodsEntry(String name, int index, int price, int stock) {
            this.name = name;
            this.index = index;
            this.price = price;
            this.stock = stock;
        }
    }

    private static int parseInt(String s, int def) {
        try {
            return Integer.parseInt(s.trim());
        } catch (Exception e) {
            return def;
        }
    }
}
