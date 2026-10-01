package com.jootm2.server.config;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Properties;

/**
 * Loads and holds runtime configuration. Mirrors the role that
 * M2Server.cfg / LoginSrv.cfg / DBServer.cfg played in the Delphi code,
 * but consolidated into a single properties file.
 */
public final class ServerConfig {

    private int port = 8080;
    private int ioThreads = 2;
    private int backlog = 256;
    private String dbFile = "data/jootm2.db";
    private int tickMs = 100;
    private int savePeriodSec = 30;
    private String webRoot = "frontend";
    private String resourcesRoot = "resources";
    private String resourcesPrefix = "/resources";
    private String gamedataRoot = "gamedata";
    private int worldWidth = 200;
    private int worldHeight = 200;
    private int playerSpawnX = 100;
    private int playerSpawnY = 100;

    private ServerConfig() {
    }

    public static ServerConfig load(String path) {
        ServerConfig cfg = new ServerConfig();
        Path p = Paths.get(path);
        if (Files.exists(p)) {
            Properties props = new Properties();
            try (InputStream in = Files.newInputStream(p)) {
                props.load(in);
            } catch (IOException e) {
                throw new IllegalStateException("Failed to read config: " + path, e);
            }
            cfg.port = getInt(props, "server.port", cfg.port);
            cfg.ioThreads = Math.max(1, getInt(props, "server.ioThreads", cfg.ioThreads));
            cfg.backlog = getInt(props, "server.backlog", cfg.backlog);
            cfg.dbFile = props.getProperty("db.file", cfg.dbFile);
            cfg.tickMs = getInt(props, "game.tickMs", cfg.tickMs);
            cfg.savePeriodSec = getInt(props, "game.savePeriodSec", cfg.savePeriodSec);
            cfg.webRoot = props.getProperty("web.root", cfg.webRoot);
            cfg.resourcesRoot = props.getProperty("resources.root", cfg.resourcesRoot);
            cfg.resourcesPrefix = props.getProperty("resources.prefix", cfg.resourcesPrefix);
            cfg.gamedataRoot = props.getProperty("gamedata.root", cfg.gamedataRoot);
            cfg.worldWidth = getInt(props, "world.width", cfg.worldWidth);
            cfg.worldHeight = getInt(props, "world.height", cfg.worldHeight);
            cfg.playerSpawnX = getInt(props, "world.playerSpawnX", cfg.playerSpawnX);
            cfg.playerSpawnY = getInt(props, "world.playerSpawnY", cfg.playerSpawnY);
        } else {
            // 未找到配置文件时回退到内置默认值，避免直接报错。
            System.out.println("[config] " + path + " not found, using built-in defaults");
        }
        return cfg;
    }

    private static int getInt(Properties props, String key, int def) {
        String v = props.getProperty(key);
        try {
            return v == null ? def : Integer.parseInt(v.trim());
        } catch (NumberFormatException e) {
            return def;
        }
    }

    public int port() { return port; }
    public int ioThreads() { return ioThreads; }
    public int backlog() { return backlog; }
    public String dbFile() { return dbFile; }
    public int tickMs() { return tickMs; }
    public int savePeriodSec() { return savePeriodSec; }
    public String webRoot() { return webRoot; }
    public String resourcesRoot() { return resourcesRoot; }
    public String resourcesPrefix() { return resourcesPrefix; }
    public String gamedataRoot() { return gamedataRoot; }
    public int worldWidth() { return worldWidth; }
    public int worldHeight() { return worldHeight; }
    public int playerSpawnX() { return playerSpawnX; }
    public int playerSpawnY() { return playerSpawnY; }
}