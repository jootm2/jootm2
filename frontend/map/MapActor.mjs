// 地图渲染器（canvas 2d，对应旧 MapActor）
// 等距瓦片 48×32，图层：大地砖 tiles → 小地砖 smtiles → 实体/对象（按行遮挡）。
// 纹理异步懒加载：未加载的 tile 先跳过，加载完成后下一帧自动补上。

import { loadMap } from './Maps.mjs';
import { getLib } from '../image/Images.mjs';

const TILE_W = 48;
const TILE_H = 32;

export class MapActor {
    constructor(viewW, viewH) {
        this.viewW = viewW;   // 可视画布宽
        this.viewH = viewH;   // 可视画布高
        this.map = null;
        this.mapId = null;
        this._texCache = new Map();   // key -> { canvas }
    }

    async enter(mapId) {
        if (mapId === this.mapId) return;
        this.mapId = mapId;
        this.map = await loadMap(mapId);
    }

    // 取纹理（未加载返回 null，并触发异步加载）
    _getTex(key, index) {
        const k = key + '/' + index;
        const hit = this._texCache.get(k);
        if (hit) return hit.canvas;   // 可能为 null（加载中）
        this._texCache.set(k, { canvas: null });
        const lib = getLib(key);
        if (lib) {
            lib.getTexture(index).then(tex => {
                this._texCache.get(k).canvas = tex ? tex.canvas : null;
            });
        }
        return null;
    }

    _libKey(base, fileIdx) {
        return fileIdx ? base + fileIdx : base;
    }

    /**
     * 绘制地图 + 实体（含对象层遮挡）。
     * @param ctx 2d 上下文
     * @param cx 玩家中心游戏坐标 x
     * @param cy 玩家中心游戏坐标 y
     * @param entities 实体列表 [{x,y,name,tex(canvas|null),isSelf}]
     */
    render(ctx, cx, cy, entities) {
        if (!this.map) return;
        const m = this.map;

        // 屏幕坐标换算：sx = (gx-cx)*48 + (viewW-48)/2
        const ox = Math.floor((this.viewW - TILE_W) / 2);
        const oy = Math.floor((this.viewH - TILE_H) / 2);
        const sx = gx => ox + (gx - cx) * TILE_W;
        const sy = gy => oy + (gy - cy) * TILE_H;

        // 可见区域（游戏坐标，含冗余）
        const halfW = Math.ceil(this.viewW / 2 / TILE_W) + 2;
        const halfH = Math.ceil(this.viewH / 2 / TILE_H) + 2;
        const left = Math.max(0, Math.floor(cx - halfW));
        const top = Math.max(0, Math.floor(cy - halfH));
        const right = Math.min(m.width - 1, Math.ceil(cx + halfW));
        const bottom = Math.min(m.height - 1, Math.ceil(cy + halfH + 30));

        // 1. 大地砖 tiles（bng 是 2×2 大图，只在偶数坐标画）
        for (let gx = left; gx <= right; gx++) {
            for (let gy = top; gy <= bottom; gy++) {
                const t = m.tiles[gx][gy];
                if (t.bng < 0) continue;
                if (gx % 2 !== 0 || gy % 2 !== 0) continue;   // 2×2 大图只在偶坐标
                const tex = this._getTex(this._libKey('tiles', t.bngFile), t.bng);
                if (tex) ctx.drawImage(tex, sx(gx), sy(gy));
            }
        }

        // 2. 小地砖 smtiles
        for (let gx = left; gx <= right; gx++) {
            for (let gy = top; gy <= bottom; gy++) {
                const t = m.tiles[gx][gy];
                if (t.mid < 0) continue;
                const tex = this._getTex(this._libKey('smtiles', t.midFile), t.mid);
                if (tex) ctx.drawImage(tex, sx(gx), sy(gy));
            }
        }

        // 3. 实体 + 对象层按行交错（y 越大越靠屏幕下方，遮挡在前）
        const byRow = new Map();
        for (const e of entities) {
            if (!byRow.has(e.y)) byRow.set(e.y, []);
            byRow.get(e.y).push(e);
        }
        for (let gy = top; gy <= bottom; gy++) {
            // 对象层（anchor 下方；动画光效用加法混合消除黑底）
            for (let gx = left; gx <= right; gx++) {
                const t = m.tiles[gx][gy];
                if (t.obj < 0) continue;
                let objIdx = t.obj;
                let blend = false;
                if (t.hasAni) {
                    // 动画对象：obj 索引为起始帧，循环播放
                    const frame = Math.floor(Date.now() / 200) % t.aniFrame;
                    objIdx = t.obj + frame;
                    blend = t.blend;
                }
                const tex = this._getTex(this._libKey('objects', t.objFile), objIdx);
                if (tex) {
                    const px = sx(gx);
                    const py = sy(gy) + TILE_H - tex.height;
                    if (blend) {
                        ctx.globalCompositeOperation = 'lighter';
                        ctx.drawImage(tex, px, py);
                        ctx.globalCompositeOperation = 'source-over';
                    } else {
                        ctx.drawImage(tex, px, py);
                    }
                }
            }
            // 实体（脚底 anchor = 格子底部中心，纹理 px/py 相对此锚点偏移）
            const row = byRow.get(gy);
            if (row) {
                for (const e of row) {
                    const anchorX = sx(e.x) + TILE_W / 2;
                    const anchorY = sy(e.y) + TILE_H;
                    if (e.layers) {
                        for (const layer of e.layers) {
                            ctx.drawImage(layer.canvas, anchorX + layer.px, anchorY + layer.py);
                        }
                    } else if (e.tex) {
                        ctx.drawImage(e.tex, anchorX - e.tex.width / 2, anchorY - e.tex.height);
                    }
                    // 名字（头顶上方，血条之上）
                    if (e.name) {
                        ctx.font = '11px SimSun,serif';
                        ctx.textAlign = 'center';
                        const tw = ctx.measureText(e.name).width;
                        const nx = sx(e.x) + TILE_W / 2;
                        const ny = sy(e.y) - 34;
                        ctx.fillStyle = 'rgba(0,0,0,0.6)';
                        ctx.fillRect(nx - tw / 2 - 3, ny - 11, tw + 6, 13);
                        ctx.fillStyle = e.isSelf ? '#ffe9b0' : '#e0d0a0';
                        ctx.fillText(e.name, nx, ny);
                    }
                }
            }
        }
    }
}
