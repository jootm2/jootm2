// .map 地图解析（对应旧 Maps.mjs）
// 解析出每个 tile 的地砖/小地砖/对象层索引 + 可行走标记。

import { mapUrl } from '../gfx/resource.mjs';

const loadedMaps = new Map();   // mapId -> {width,height,tiles}

export async function loadMap(mapId) {
    if (loadedMaps.has(mapId)) return loadedMaps.get(mapId);
    const url = mapUrl(mapId);
    if (!url) throw new Error(`地图 ${mapId} 未在 resources.json 中`);

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`加载 ${url} 失败`);
    const buf = await resp.arrayBuffer();
    const view = new DataView(buf);

    const width = view.getUint16(0, true);
    const height = view.getUint16(2, true);
    const tileByteSize = (buf.byteLength - 52) / width / height;

    let off = 52;
    const tiles = [];
    for (let x = 0; x < width; x++) {
        tiles[x] = [];
        for (let y = 0; y < height; y++) {
            const bng = view.getInt16(off, true); off += 2;
            const mid = view.getInt16(off, true); off += 2;
            const obj = view.getInt16(off, true); off += 2;
            const doorIdx = view.getInt8(off); off++;
            const doorOffset = view.getInt8(off); off++;
            const ani = view.getInt8(off); off++;
            const aniTick = view.getInt8(off); off++;
            const objFileIdx = view.getInt8(off); off++;
            const light = view.getInt8(off); off++;

            let bngFileIdx = 0, midFileIdx = 0;
            if (tileByteSize >= 14) {
                bngFileIdx = view.getInt8(off); off++;
                midFileIdx = view.getInt8(off); off++;
                if (tileByteSize > 14) off += tileByteSize - 14;
            }

            tiles[x][y] = {
                bng: (bng & 0x7fff) > 0 ? (bng & 0x7fff) - 1 : -1,
                mid: (mid & 0x7fff) > 0 ? (mid & 0x7fff) - 1 : -1,
                obj: (obj & 0x7fff) > 0 ? (obj & 0x7fff) - 1 : -1,
                canStand: (bng & 0x8000) === 0 && (mid & 0x8000) === 0 && (obj & 0x8000) === 0,
                // 高墙（FrImg 0x8000）：阻挡飞行/视线（灵魂火符等投射魔法撞墙中断，对齐 Envir.CanFireFly）
                highWall: (obj & 0x8000) !== 0,
                bngFile: bngFileIdx !== 0 ? bngFileIdx + 1 : 0,
                midFile: midFileIdx !== 0 ? midFileIdx + 1 : 0,
                objFile: objFileIdx !== 0 ? objFileIdx + 1 : 0,
                hasAni: (ani & 0x7f) > 0,
                aniFrame: ani & 0x7f,
                blend: (ani & 0x80) !== 0,
            };
        }
    }

    const map = { width, height, tiles };
    loadedMaps.set(mapId, map);
    return map;
}
