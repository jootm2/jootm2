package com.jootm2.server.game.npc;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A parsed NPC script (Npc_Def / Market_Def). Mirrors the {@code Sayings} list
 * of {@code PTQuestRecord} compiled by {@code TFrmDB.LoadMarketDef} in
 * LocalDB.pas, simplified to the subset used by the standard scripts.
 *
 * <p>Structure: a script is a set of labelled sections ({@code [@main]}, ...).
 * Each section is an ordered list of statements; a statement is either a plain
 * text block or an {@code #IF / #ACT / #SAY / #ELSESAY / #ELSEACT} conditional.
 */
public final class NpcScript {

    // Parser state machine states.
    private static final int NONE = 0;
    private static final int IF_COND = 1;
    private static final int IF_ACT = 2;
    private static final int IF_SAY = 3;
    private static final int ELSE_ACT = 4;
    private static final int ELSE_SAY = 5;

    private final Map<String, Section> sections = new LinkedHashMap<>();

    public Section section(String label) {
        Section s = sections.get(label);
        if (s != null) {
            return s;
        }
        // 脚本链接大小写可能不一致（如 <返 回/@Main> vs [@main]），忽略大小写再匹配
        for (Map.Entry<String, Section> e : sections.entrySet()) {
            if (e.getKey().equalsIgnoreCase(label)) {
                return e.getValue();
            }
        }
        return null;
    }

    public int sectionCount() {
        return sections.size();
    }

    public boolean hasGoods() {
        return sections.containsKey("goods");
    }

    // -- statements ---------------------------------------------------------

    public static final class Section {
        public final String label;
        public final List<Stmt> stmts = new ArrayList<>();

        Section(String label) {
            this.label = label;
        }
    }

    public abstract static class Stmt {
    }

    /** A plain block of say-text (may contain {@code <label/@tag>} links). */
    public static final class TextStmt extends Stmt {
        public final String text;

        TextStmt(String text) {
            this.text = text;
        }
    }

    /** An {@code #IF ...} conditional with pass/fail branches. */
    public static final class IfStmt extends Stmt {
        public final List<Cmd> conditions = new ArrayList<>();
        public final List<Cmd> actions = new ArrayList<>();
        public final List<Cmd> elseActions = new ArrayList<>();
        public String sayText;
        public String elseSayText;
    }

    /** A single decoded command: {@code name param tag extra}. */
    public static final class Cmd {
        public final String name;
        public final String param;
        public final String tag;
        public final String extra;

        Cmd(String name, String param, String tag, String extra) {
            this.name = name;
            this.param = param;
            this.tag = tag;
            this.extra = extra;
        }

        public int paramInt(int def) {
            return parseInt(param, def);
        }

        public int tagInt(int def) {
            return parseInt(tag, def);
        }

        public int extraInt(int def) {
            return parseInt(extra, def);
        }

        private static int parseInt(String s, int def) {
            try {
                return Integer.parseInt(s.trim());
            } catch (Exception e) {
                return def;
            }
        }
    }

    // -- parser -------------------------------------------------------------

    public static NpcScript parse(List<String> lines) {
        NpcScript script = new NpcScript();
        Section cur = null;

        int state = NONE;
        IfStmt curIf = null;
        StringBuilder textBuf = new StringBuilder();

        for (String raw : lines) {
            String line = raw.trim();
            if (line.isEmpty()) {
                continue;
            }
            if (line.startsWith(";")) {
                continue;   // comment
            }
            if (line.startsWith("[") && line.endsWith("]")) {
                // start a new section: [@label] or special [goods]
                flushText(script, cur, textBuf, state, curIf);
                curIf = null;
                String label;
                if (line.startsWith("[@")) {
                    label = line.substring(2, line.length() - 1).trim();
                } else {
                    label = line.substring(1, line.length() - 1).trim();
                }
                cur = new Section(label);
                script.sections.put(label, cur);
                state = NONE;
                continue;
            }
            if (cur == null) {
                continue;   // content before first section
            }
            if (line.startsWith("#")) {
                String upper = line.toUpperCase();
                if (upper.startsWith("#IF")) {
                    flushText(script, cur, textBuf, state, curIf);
                    curIf = new IfStmt();
                    cur.stmts.add(curIf);
                    state = IF_COND;
                } else if (upper.startsWith("#ACT")) {
                    flushText(script, cur, textBuf, state, curIf);
                    if (curIf == null) {
                        curIf = new IfStmt();
                        cur.stmts.add(curIf);
                    }
                    state = IF_ACT;
                } else if (upper.startsWith("#SAY")) {
                    flushText(script, cur, textBuf, state, curIf);
                    if (curIf == null) {
                        curIf = new IfStmt();
                        cur.stmts.add(curIf);
                    }
                    state = IF_SAY;
                } else if (upper.startsWith("#ELSEACT")) {
                    flushText(script, cur, textBuf, state, curIf);
                    if (curIf == null) {
                        curIf = new IfStmt();
                        cur.stmts.add(curIf);
                    }
                    state = ELSE_ACT;
                } else if (upper.startsWith("#ELSESAY")) {
                    flushText(script, cur, textBuf, state, curIf);
                    if (curIf == null) {
                        curIf = new IfStmt();
                        cur.stmts.add(curIf);
                    }
                    state = ELSE_SAY;
                } else {
                    // ignore other directives (#DEFINE, #CALL, #INCLUDE, ...)
                }
                continue;
            }
            // ordinary line
            switch (state) {
                case IF_COND:
                    curIf.conditions.add(decode(line));
                    break;
                case IF_ACT:
                    curIf.actions.add(decode(line));
                    break;
                case IF_SAY:
                    append(textBuf, line);
                    break;
                case ELSE_ACT:
                    curIf.elseActions.add(decode(line));
                    break;
                case ELSE_SAY:
                    append(textBuf, line);
                    break;
                default:
                    append(textBuf, line);
                    break;
            }
        }
        flushText(script, cur, textBuf, state, curIf);
        return script;
    }

    /** Flushes buffered say-text into the current IF statement or as a text stmt. */
    private static void flushText(NpcScript script, Section cur, StringBuilder buf,
                                  int state, IfStmt curIf) {
        String text = buf.toString();
        buf.setLength(0);
        if (text.isEmpty()) {
            return;
        }
        if (cur == null) {
            return;
        }
        if (curIf != null && (state == IF_SAY || state == ELSE_SAY)) {
            if (state == IF_SAY) {
                curIf.sayText = join(curIf.sayText, text);
            } else {
                curIf.elseSayText = join(curIf.elseSayText, text);
            }
        } else {
            cur.stmts.add(new TextStmt(text));
        }
    }

    private static void append(StringBuilder buf, String line) {
        if (buf.length() > 0) {
            buf.append('\n');
        }
        buf.append(line);
    }

    private static String join(String existing, String more) {
        return existing == null ? more : existing + "\n" + more;
    }

    /** Splits {@code name param tag extra} handling quoted (spaced) params. */
    private static Cmd decode(String line) {
        List<String> parts = split(line);
        String name = parts.size() > 0 ? parts.get(0) : "";
        String param = parts.size() > 1 ? parts.get(1) : "";
        String tag = parts.size() > 2 ? parts.get(2) : "";
        String extra = parts.size() > 3 ? parts.get(3) : "";
        return new Cmd(name, param, tag, extra);
    }

    private static List<String> split(String line) {
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
        return out;
    }
}
