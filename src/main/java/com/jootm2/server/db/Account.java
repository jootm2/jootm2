package com.jootm2.server.db;

/**
 * Minimal account row (id is the primary key).
 */
public final class Account {
    public long id;
    public String username;
    public String passwordHash;
    public String salt;
    public long createdAt;
    public long lastLogin;

    public Account() {
    }

    public Account(long id, String username, String passwordHash, String salt, long createdAt, long lastLogin) {
        this.id = id;
        this.username = username;
        this.passwordHash = passwordHash;
        this.salt = salt;
        this.createdAt = createdAt;
        this.lastLogin = lastLogin;
    }
}