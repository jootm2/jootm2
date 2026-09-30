package com.jootm2.server.game.common;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;

/**
 * A magic/skill definition imported from mud2/DB/Magic.DB. The authoritative
 * field layout lives in the Delphi source (M2Server/LocalDB.pas); the Paradox
 * file itself only stores field types/sizes, so the attribute values beyond
 * {@code magId}/{@code name} are preserved here as an ordered typed list and
 * can be mapped to named fields once a skill system is implemented.
 */
public final class MagicTemplate {

    public static final Gson GSON = new GsonBuilder().create();

    public int magId;
    public String name = "";
    public JsonArray attrs = new JsonArray();

    public String serialize() {
        return GSON.toJson(this);
    }

    public static MagicTemplate deserialize(String json) {
        return GSON.fromJson(json, MagicTemplate.class);
    }
}