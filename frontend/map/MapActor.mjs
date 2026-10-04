// 地图渲染器（canvas 2d，对应旧 MapActor / PlayScn.pas 渲染语义）
// 等距瓦片 48×32，图层：大地砖 tiles → 小地砖 smtiles → 实体/对象（按行遮挡）。
// 绘制语义照原版 PlayScn.pas：
//   - 普通对象：格子左上对齐，底对齐（y = 格顶 + 32 - h）
//   - 混合光效（blend）：x = 格左 + px - 2，y = 格顶 + py - 68（GetObjsEx 的 ax/ay = WIL px/py）
//   - 名字/血条：贴 sprite 顶部（取各层最小 py）
// 平滑卷动：render 接收 shiftX/shiftY（玩家移动插值），坐标收口在 screenX/screenY。

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
        this._texCache = new Map();   // key -> { canvas, px, py }
        // render 时缓存（供 screenX/screenY 使用）
        this._cx = 0;
        this._cy = 0;
        this._shiftX = 0;
        this._shiftY = 0;
    }

    async enter(mapId) {
        if (mapId === this.mapId) return;
        this.mapId = mapId;
        this.map = await loadMap(mapId);
    }

    // 取纹理（含 px/py；未加载返回 null，并触发异步加载）
    _getTex(key, index) {
        const k = key + '/' + index;
        const hit = this._texCache.get(k);
        if (hit) return hit.canvas ? hit : null;   // 加载中返回 null
        this._texCache.set(k, { canvas: null, px: 0, py: 0 });
        const lib = getLib(key);
        if (lib) {
            lib.getTexture(index).then(tex => {
                const e = this._texCache.get(k);
                if (tex) { e.canvas = tex.canvas; e.px = tex.px; e.py = tex.py; }
            });
        }
        return null;
    }

    _libKey(base, fileIdx) {
        return fileIdx ? base + fileIdx : base;
    }

    // 屏幕坐标（收口：所有叠加物——血条/名字/地面物品/高亮——都用这两个换算）
    screenX(gx) {
        const ox = Math.floor((this.viewW - TILE_W) / 2);
        return ox + (gx - this._cx) * TILE_W - this._shiftX;
    }

    screenY(gy) {
        const oy = Math.floor((this.viewH - TILE_H) / 2);
        return oy + (gy - this._cy) * TILE_H - this._shiftY;
    }

    /**
     * 绘制地图 + 实体（含对象层遮挡）。
     * @param shiftX/shiftY 平滑卷动偏移（玩家从旧格滑向新格的插值，像素）
     * @param entities [{x,y,name,isSelf,hp,maxHp,isTarget,layers:[{canvas,px,py}]}]
     */
    render(ctx, cx, cy, entities, shiftX = 0, shiftY = 0) {
        if (!this.map) return;
        const m = this.map;
        this._cx = cx;
        this._cy = cy;
        this._shiftX = shiftX;
        this._shiftY = shiftY;

        const sx = gx => this.screenX(gx);
        const sy = gy => this.screenY(gy);

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
                if (gx % 2 !== 0 || gy % 2 !== 0) continue;
                const tex = this._getTex(this._libKey('tiles', t.bngFile), t.bng);
                if (tex) ctx.drawImage(tex.canvas, sx(gx), sy(gy));
            }
        }

        // 2. 小地砖 smtiles
        for (let gx = left; gx <= right; gx++) {
            for (let gy = top; gy <= bottom; gy++) {
                const t = m.tiles[gx][gy];
                if (t.mid < 0) continue;
                const tex = this._getTex(this._libKey('smtiles', t.midFile), t.mid);
                if (tex) ctx.drawImage(tex.canvas, sx(gx), sy(gy));
            }
        }

        // 3. 实体 + 对象层按行交错（y 越大越靠屏幕下方，遮挡在前）
        const byRow = new Map();
        for (const e of entities) {
            if (!byRow.has(e.y)) byRow.set(e.y, []);
            byRow.get(e.y).push(e);
        }
        for (let gy = top; gy <= bottom; gy++) {
            // 对象层（照 PlayScn.pas：普通对象左上+底对齐；blend 光效 x=格左+px-2, y=格顶+py-68）
            for (let gx = left; gx <= right; gx++) {
                const t = m.tiles[gx][gy];
                if (t.obj < 0) continue;
                let objIdx = t.obj;
                let blend = false;
                if (t.hasAni) {
                    const frame = Math.floor(Date.now() / 200) % t.aniFrame;
                    objIdx = t.obj + frame;
                    blend = t.blend;
                }
                const tex = this._getTex(this._libKey('objects', t.objFile), objIdx);
                if (tex) {
                    let px, py;
                    if (blend) {
                        px = sx(gx) + (tex.px || 0) - 2;
                        py = sy(gy) + (tex.py || 0) - 68;
                    } else {
                        px = sx(gx);
                        py = sy(gy) + TILE_H - tex.canvas.height;
                    }
                    if (blend) {
                        ctx.globalCompositeOperation = 'lighter';
                        ctx.drawImage(tex.canvas, px, py);
                        ctx.globalCompositeOperation = 'source-over';
                    } else {
                        ctx.drawImage(tex.canvas, px, py);
                    }
                }
            }
            // 实体（照原版：锚点 = 格子左上角，图左上 = 格左+px, 格顶+py）
            const row = byRow.get(gy);
            if (row) {
                for (const e of row) {
                    // 锚点 = 格子左上 + 走动画偏移（self 用 _viewX 过渡，offsetX/Y 为像素差）
                    const anchorX = sx(e.x) + (e.offsetX || 0);
                    const anchorY = sy(e.y) + (e.offsetY || 0);
                    if (e.layers) {
                        ctx.save();
                        // 隐身术：半透明
                        if (e.alpha != null && e.alpha < 1) ctx.globalAlpha = e.alpha;
                        for (const layer of e.layers) {
                            if (layer.canvas) {
                                ctx.drawImage(layer.canvas, anchorX + layer.px, anchorY + layer.py);
                            }
                        }
                        // 中毒：绿色调覆盖（source-atop 仅作用于已绘制的实体像素）
                        if (e.poison) {
                            ctx.globalCompositeOperation = 'source-atop';
                            ctx.fillStyle = 'rgba(60,255,60,0.35)';
                            ctx.fillRect(anchorX - 8, anchorY - 80, 72, 110);
                        }
                        ctx.restore();
                    } else if (e.tex) {
                        ctx.drawImage(e.tex, anchorX - e.tex.width / 2, anchorY - e.tex.height);
                    }

                    // 血条（原版 DrawScrn：SayY - 10 = 格顶 - 57，头顶上方）
                    if (e.maxHp) {
                        const hp = Math.max(0, e.hp != null ? e.hp : e.maxHp);
                        const bx0 = anchorX + TILE_W / 2 - 20;
                        const by0 = anchorY - 57;
                        ctx.fillStyle = '#000';
                        ctx.fillRect(bx0 - 1, by0 - 1, 42, 6);
                        ctx.fillStyle = e.isSelf ? '#0ea5e9' : '#ef4444';
                        ctx.fillRect(bx0, by0, 40 * hp / e.maxHp, 4);
                    }

                    // 施法目标高亮（框住 sprite 区域，固定大小）
                    if (e.isTarget) {
                        ctx.strokeStyle = '#ff3b3b';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(anchorX + 4, anchorY - 70, 40, 100);
                    }

                    // 名字（血条上方：格顶 - 71，与血条 -57 一起都在头顶上方）
                    if (e.name) {
                        ctx.font = '11px SimSun,serif';
                        ctx.textAlign = 'center';
                        const tw = ctx.measureText(e.name).width;
                        const nx = anchorX + TILE_W / 2;
                        const ny = anchorY - 71;
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
