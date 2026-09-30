package com.jootm2.server.service;

import com.google.gson.JsonObject;

/**
 * Transport abstraction for a connected client. Implemented by the WebSocket
 * handler so the game service never depends on networking internals.
 */
public interface PlayerSession {

    void sendText(String text);

    default void sendJson(JsonObject o) {
        sendText(o.toString());
    }

    void close();

    long getAccountId();

    void setAccountId(long id);

    String getPlayerName();

    void setPlayerName(String name);
}