package com.jootm2.server.resource;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.Charset;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Minimal read-only parser for the Paradox (.DB) tables the original Delphi
 * server kept under mud2/DB (StdItems, Magic, Monster). DBC2000 / BDE uses
 * exactly this file format.
 *
 * <p>Layout (all multi-byte header values are little-endian):
 * <pre>
 *   0x00 recordSize (u16)
 *   0x02 blockSize  (u16)
 *   0x06 record count (u32)
 *   0x78 field descriptors, each a pair [type(1)][size(1)]
 * </pre>
 * Data blocks follow the header block; each block has a 6-byte header and then
 * packed fixed-size records. Integers are stored big-endian with a flag bit in
 * the most-significant byte, strings are raw bytes (GBK) padded with NULs.</p>
 */
public final class ParadoxDb {

    public static final int TYPE_ALPHA = 0x01;
    public static final int TYPE_SHORT = 0x03;
    public static final int TYPE_LONG_INT = 0x04;

    private static final Charset GBK = Charset.forName("GBK");

    public final List<Integer> fieldTypes = new ArrayList<>();
    public final List<Integer> fieldSizes = new ArrayList<>();
    public final List<Object[]> records = new ArrayList<>();
    public int recordCount;

    public static ParadoxDb read(Path file) throws IOException {
        byte[] all = Files.readAllBytes(file);
        ByteBuffer buf = ByteBuffer.wrap(all).order(ByteOrder.LITTLE_ENDIAN);

        int recordSize = buf.getShort(0) & 0xFFFF;
        int blockSize = buf.getShort(2) & 0xFFFF;
        int numRecords = buf.getInt(6);

        ParadoxDb db = new ParadoxDb();
        db.recordCount = numRecords;

        int off = 0x78;
        int sum = 0;
        while (sum < recordSize) {
            int type = buf.get(off) & 0xFF;
            int size = buf.get(off + 1) & 0xFF;
            db.fieldTypes.add(type);
            db.fieldSizes.add(size);
            sum += size;
            off += 2;
        }

        int perBlock = (blockSize - 6) / recordSize;
        int remaining = numRecords;
        for (int block = 1; remaining > 0; block++) {
            int base = block * blockSize;
            if (base + recordSize > all.length) {
                break;
            }
            int n = Math.min(remaining, perBlock);
            int recOff = base + 6;
            for (int r = 0; r < n; r++) {
                Object[] rec = new Object[db.fieldTypes.size()];
                int p = recOff + r * recordSize;
                for (int f = 0; f < rec.length; f++) {
                    int t = db.fieldTypes.get(f);
                    int s = db.fieldSizes.get(f);
                    rec[f] = decode(buf, p, t, s);
                    p += s;
                }
                db.records.add(rec);
            }
            remaining -= n;
        }
        return db;
    }

    private static Object decode(ByteBuffer buf, int off, int type, int size) {
        switch (type) {
            case TYPE_ALPHA: {
                int len = 0;
                while (len < size && buf.get(off + len) != 0) {
                    len++;
                }
                return new String(readBytes(buf, off, len), GBK);
            }
            case TYPE_SHORT: {
                // 16-bit with a flag bit in the high byte (big-endian).
                return ((buf.get(off) & 0x7F) << 8) | (buf.get(off + 1) & 0xFF);
            }
            case TYPE_LONG_INT: {
                return ((buf.get(off) & 0x7F) << 24)
                        | ((buf.get(off + 1) & 0xFF) << 16)
                        | ((buf.get(off + 2) & 0xFF) << 8)
                        | (buf.get(off + 3) & 0xFF);
            }
            default:
                return 0;
        }
    }

    private static byte[] readBytes(ByteBuffer buf, int off, int len) {
        byte[] b = new byte[len];
        for (int i = 0; i < len; i++) {
            b[i] = buf.get(off + i);
        }
        return b;
    }
}