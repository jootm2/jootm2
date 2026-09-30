package com.jootm2.server.game.npc;

import com.google.gson.JsonObject;
import com.jootm2.server.game.Actor;
import com.jootm2.server.game.common.MessageIds;

/**
 * A static NPC (dialogue quest giver, teleporter, merchant, etc.) placed on a
 * map. Mirrors TNormNpc / TMerchant from ObjNpc.pas. NPCs never move, never die,
 * and respond to {@code npcTalk} / {@code npcSelect} protocol messages.
 */
public final class Npc extends Actor {

    /** Script file base name (Npcs.txt name or MerChant.txt market name). */
    public String scriptName = "";
    /** Race code from Npcs.txt (0 merchant, 1 guild official, 2 castle manager). */
    public int npcKind;
    /** Appearance / body id used for rendering. */
    public int npcFace;

    /** True when this NPC offers a market ([goods] list). */
    public boolean merchant;

    /** Loaded script (may be null if no Npc_Def/Market_Def file exists). */
    public NpcScript script;

    public Npc(long id, String name) {
        super(id);
        this.name = name;
        this.race = MessageIds.RC_PEACENPC;
        this.alive = true;
        this.level = 1;
    }

    @Override
    public boolean isPlayer() {
        return false;
    }

    @Override
    public JsonObject toBriefJson() {
        JsonObject o = super.toBriefJson();
        o.addProperty("type", "npc");
        o.addProperty("merchant", merchant);
        return o;
    }
}
