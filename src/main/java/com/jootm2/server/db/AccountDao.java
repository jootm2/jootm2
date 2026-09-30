package com.jootm2.server.db;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * Account registry, replaces Logsrv/IDDB.pas and part of the BDE account table.
 * Passwords are stored as salted SHA-256 hashes rather than the plain text /
 * reversible encoding of the original client.
 */
public final class AccountDao {

    private final Database db;

    public AccountDao(Database db) {
        this.db = db;
    }

    /** Creates an account, or returns null when the username is already taken. */
    public Account register(String username, String password) {
        if (exists(username)) {
            return null;
        }
        String salt = DbUtil.newSalt();
        String hash = DbUtil.hashPassword(salt, password);
        long now = System.currentTimeMillis();
        Connection c = db.connection();
        synchronized (c) {
            try (PreparedStatement ps = c.prepareStatement(
                    "INSERT INTO accounts (username, password_hash, salt, created_at, last_login) VALUES (?,?,?,?,?)",
                    Statement.RETURN_GENERATED_KEYS)) {
                ps.setString(1, username);
                ps.setString(2, hash);
                ps.setString(3, salt);
                ps.setLong(4, now);
                ps.setLong(5, now);
                ps.executeUpdate();
                try (ResultSet keys = ps.getGeneratedKeys()) {
                    if (keys.next()) {
                        return new Account(keys.getLong(1), username, hash, salt, now, now);
                    }
                }
            } catch (SQLException e) {
                throw new RuntimeException("register account failed", e);
            }
        }
        return null;
    }

    /** Verifies username + password and returns the account, or null on failure. */
    public Account authenticate(String username, String password) {
        Account a = find(username);
        if (a == null) {
            return null;
        }
        String hash = DbUtil.hashPassword(a.salt, password);
        if (!hash.equals(a.passwordHash)) {
            return null;
        }
        touchLogin(a.id);
        return a;
    }

    public Account find(String username) {
        Connection c = db.connection();
        synchronized (c) {
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT id, username, password_hash, salt, created_at, last_login FROM accounts WHERE username = ?")) {
                ps.setString(1, username);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) {
                        return new Account(
                                rs.getLong(1),
                                rs.getString(2),
                                rs.getString(3),
                                rs.getString(4),
                                rs.getLong(5),
                                rs.getLong(6));
                    }
                }
            } catch (SQLException e) {
                throw new RuntimeException("find account failed", e);
            }
        }
        return null;
    }

    public boolean exists(String username) {
        return find(username) != null;
    }

    public void touchLogin(long id) {
        Connection c = db.connection();
        synchronized (c) {
            try (PreparedStatement ps = c.prepareStatement(
                    "UPDATE accounts SET last_login = ? WHERE id = ?")) {
                ps.setLong(1, System.currentTimeMillis());
                ps.setLong(2, id);
                ps.executeUpdate();
            } catch (SQLException e) {
                throw new RuntimeException("touch login failed", e);
            }
        }
    }
}