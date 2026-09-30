package com.jootm2.server;

import com.jootm2.server.config.ServerConfig;
import com.jootm2.server.db.Database;
import com.jootm2.server.net.NettyServer;
import com.jootm2.server.resource.ResourcesIndexGenerator;
import com.jootm2.server.service.GameService;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * jootm2 entrypoint. Wires together config, SQLite persistence, the in-memory
 * game world, the Netty HTTP + WebSocket server, and the two background loops
 * (game tick + periodic save).
 */
public final class Main {

    private Main() {
    }

    public static void main(String[] args) throws Exception {
        String configPath = args.length > 0 ? args[0] : "config/server.properties";
        ServerConfig config = ServerConfig.load(configPath);

        Database db = new Database(config.dbFile());
        Path mud2Dir = Paths.get(config.gamedataRoot(), "mud2", "DB").toAbsolutePath();
        db.seedGameData(mud2Dir);
        GameService game = new GameService(config, db);

        Path webRoot = Paths.get(config.webRoot()).toAbsolutePath();
        Path resourcesRoot = Paths.get(config.resourcesRoot()).toAbsolutePath();
        try {
            ResourcesIndexGenerator.generate(resourcesRoot);
        } catch (Exception e) {
            System.err.println("[main] failed to generate resources.json: " + e.getMessage());
        }
        NettyServer server = new NettyServer(game, webRoot, resourcesRoot, config.resourcesPrefix());
        server.start(config.port(), config.ioThreads(), config.backlog());

        ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2, r -> {
            Thread t = new Thread(r, "game-loop");
            t.setDaemon(false);
            return t;
        });

        long tickMs = Math.max(10L, config.tickMs());
        scheduler.scheduleAtFixedRate(game::tick, 0L, tickMs, TimeUnit.MILLISECONDS);
        scheduler.scheduleAtFixedRate(game::saveAllPlayers,
                config.savePeriodSec(), config.savePeriodSec(), TimeUnit.SECONDS);

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("[main] shutting down, saving players...");
            try {
                game.saveAllPlayers();
            } catch (Exception ignored) {
            }
            scheduler.shutdownNow();
            server.close();
            try {
                db.close();
            } catch (Exception ignored) {
            }
        }, "shutdown-hook"));

        System.out.println("[main] jootm2 started on port " + config.port());
        System.out.println("[main]   client  : http://localhost:" + config.port() + "/");
        System.out.println("[main]   ws      : ws://localhost:" + config.port() + "/ws");
        System.out.println("[main]   resource: http://localhost:" + config.port() + config.resourcesPrefix() + "/resources.json");
    }
}