// WIL 图片库加载 + 纹理缓存（对应旧 WIL.pas）
// 8 位索引色 + 256 色调色板 → RGBA ImageData → 离屏 canvas 缓存
// 懒加载：按需 HTTP Range 拉取单图，缓存超过 5 分钟未用则释放（对应 FreeOldMemorys）

import { PALETTE_RGBA, widthBytes, skipBytes } from './palette.mjs';

// 兼容创建离屏画布
function createCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') {
        return new OffscreenCanvas(w, h);
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
}

export class WIL {
    constructor(wilUrl, wixUrl) {
        this.wilUrl = wilUrl;
        this.wixUrl = wixUrl;
        this.imageCount = 0;
        this.offsetList = [];        // 每图在 wil 的偏移（0=空图）
        this.indexLoaded = false;
        this.textures = new Map();   // index -> { canvas, px, py, width, height }
        this.lastUse = new Map();    // index -> 最后使用时间戳
        this.memCheckTime = Date.now();
    }

    // 加载 WIX 索引
    async loadIndex() {
        if (this.indexLoaded) return;
        const resp = await fetch(this.wixUrl);
        if (!resp.ok) throw new Error(`加载 ${this.wixUrl} 失败`);
        const buf = await resp.arrayBuffer();
        const view = new DataView(buf);
        this.imageCount = view.getUint32(44, true);
        for (let i = 0; i < this.imageCount; i++) {
            const off = view.getUint32(48 + i * 4, true);
            this.offsetList[i] = off < 1080 ? 0 : off;
        }
        this.indexLoaded = true;
    }

    // 释放超时缓存（>5 分钟未用）
    freeOldTextures() {
        const now = Date.now();
        for (const [index, last] of this.lastUse) {
            if (now - last > 5 * 60 * 1000) {
                this.textures.delete(index);
                this.lastUse.delete(index);
            }
        }
    }

    // 懒加载获取纹理（返回 {canvas, px, py, width, height} 或 null）
    async getTexture(index) {
        if (this.textures.has(index)) {
            this.lastUse.set(index, Date.now());
            return this.textures.get(index);
        }
        await this.loadIndex();
        if (index < 0 || index >= this.imageCount) return null;
        const off = this.offsetList[index];
        if (off === 0) return null;   // 空图

        // 定时释放缓存（对应旧 memchecktime / FreeOldMemorys）
        const now = Date.now();
        if (now - this.memCheckTime > 10 * 1000) {
            this.memCheckTime = now;
            this.freeOldTextures();
        }

        // 拉取 WIL 片段（最多 512K，含后续多图，一次网络交互多解几张）
        const end = off + 512 * 1024;
        const resp = await fetch(this.wilUrl, { headers: { Range: `bytes=${off}-${end}` } });
        if (!resp.ok) return null;
        const buf = await resp.arrayBuffer();
        const view = new DataView(buf);

        const tex = this._unpackOne(view, index, off);
        if (tex) {
            this.textures.set(index, tex);
            this.lastUse.set(index, Date.now());
        }
        return tex;
    }

    // 从片段数据解一张图（片段相对 offset 的偏移为 0，即 off 处就是图头）
    _unpackOne(view, index, fileOff) {
        // 片段起始即该图头
        let p = 0;
        const width = view.getUint16(p, true); p += 2;
        const height = view.getUint16(p, true); p += 2;
        const px = view.getInt16(p, true); p += 2;
        const py = view.getInt16(p, true); p += 2;

        if (width <= 0 || height <= 0) return null;

        // 位深：下一图偏移 - 本图偏移 判定（8 位或 16 位 RGB565）
        const nextOff = this.offsetList[index + 1] || (fileOff + 8 + width * height);
        const bitCount = (nextOff - fileOff >= 8 + width * height * 2) ? 16 : 8;

        const rgba = new Uint8Array(width * height * 4);

        if (bitCount === 8) {
            const pixelLength = nextOff - fileOff - 8;
            const padding = pixelLength !== width * height && pixelLength === widthBytes(8 * width) * height;
            for (let h = height - 1; h >= 0; h--) {
                for (let w = 0; w < width; w++) {
                    if (padding && w === 0) p += skipBytes(8, width);
                    const ci = view.getUint8(p++);
                    const base = ci << 2;
                    const idx = (w + h * width) << 2;
                    rgba[idx]     = PALETTE_RGBA[base];
                    rgba[idx + 1] = PALETTE_RGBA[base + 1];
                    rgba[idx + 2] = PALETTE_RGBA[base + 2];
                    rgba[idx + 3] = PALETTE_RGBA[base + 3];
                }
            }
        } else {
            // 16 位 RGB565
            for (let h = height - 1; h >= 0; h--) {
                for (let w = 0; w < width; w++, p += 2) {
                    const pdata = view.getUint16(p, true);
                    const r = (pdata & 0xf800) >> 8;
                    const g = (pdata & 0x7e0) >> 3;
                    const b = (pdata & 0x1f) << 3;
                    const idx = (w + h * width) << 2;
                    rgba[idx]     = r;
                    rgba[idx + 1] = g;
                    rgba[idx + 2] = b;
                    rgba[idx + 3] = (r === 0 && g === 0 && b === 0) ? 0 : 255;
                }
            }
        }

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
        return { canvas, px, py, width, height };
    }
}
