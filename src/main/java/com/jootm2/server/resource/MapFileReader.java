package com.jootm2.server.resource;

import com.jootm2.server.game.GameMap;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Reads a Legend-of-Mir {@code .map} file into a {@link GameMap} walkability
 * grid. The 52-byte header is {@code width, height, title(1+20), date(8),
 * reserved(19)}, followed by {@code width*height} cells of 12 bytes each
 * (bng/mid/obj + door/animation/light); the 0x8000 bit on bng/mid/obj marks a
 * cell as blocking.
 */
public final class MapFileReader {

    private MapFileReader() {
    }

    public static GameMap read(String mapId, Path mapDir) {
        Path file = resolveFile(mapId, mapDir);
        if (file == null) {
            System.err.println("[map] not found: " + mapId);
            return new GameMap(mapId, 256, 256);
        }
        try {
            byte[] all = Files.readAllBytes(file);
            ByteBuffer buf = ByteBuffer.wrap(all).order(ByteOrder.LITTLE_ENDIAN);
            int width = buf.getShort(0) & 0xFFFF;
            int height = buf.getShort(2) & 0xFFFF;
            GameMap map = new GameMap(mapId, width, height);

            int off = 52;
            // 注意：.map 的 tile 按「列优先」存储（x 外层、y 内层），
            // 必须与客户端解析顺序一致，否则阻挡网格会被转置、碰撞错位。
            for (int x = 0; x < width; x++) {
                for (int y = 0; y < height; y++) {
                    if (off + 12 > all.length) {
                        return map;
                    }
                    int bng = buf.getShort(off) & 0xFFFF;      // BkImg（背景图）
                    int mid = buf.getShort(off + 2) & 0xFFFF;  // MidImg（中间图）
                    int obj = buf.getShort(off + 4) & 0xFFFF;  // FrImg（前景图）
                    int doorIndex = buf.get(off + 6) & 0xFF;   // 第 7 字节：门标志+门号
                    off += 12;
                    // 原版 Envir.pas：BkImg 0x8000 → MoveAttr=1（普通阻挡），FrImg 0x8000 → MoveAttr=2=MP_HIGHWALL（高墙，阻挡飞行/视线）
                    if ((obj & 0x8000) != 0) {
                        map.setHighWall(x, y);   // FrImg 0x8000 → 高墙：阻挡移动 + 飞行/视线
                    } else if ((bng & 0x8000) != 0 || (mid & 0x8000) != 0) {
                        map.setBlocked(x, y, true);   // BkImg/MidImg 0x8000 → 普通阻挡：只挡移动，不挡飞行
                    }
                    // 门：0x80 位=门标志，低 7 位=门号
                    if ((doorIndex & 0x80) != 0 && (doorIndex & 0x7F) > 0) {
                        map.setDoor(x, y);
                    }
                }
            }
            return map;
        } catch (IOException e) {
            System.err.println("[map] failed to read " + file + ": " + e.getMessage());
            return new GameMap(mapId, 256, 256);
        }
    }

    /** True when a {@code .map} / {@code .MAP} file exists for the given id. */
    public static boolean exists(String mapId, Path mapDir) {
        return resolveFile(mapId, mapDir) != null;
    }

    /** Resolves a map file case-insensitively ({@code 4.map} vs {@code 4.MAP}). */
    private static Path resolveFile(String mapId, Path mapDir) {
        Path f = mapDir.resolve(mapId + ".map");
        if (Files.exists(f)) {
            return f;
        }
        Path upper = mapDir.resolve(mapId + ".MAP");
        if (Files.exists(upper)) {
            return upper;
        }
        return null;
    }
}