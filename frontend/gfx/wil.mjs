// WIL 图片库加载 + 纹理缓存（对应旧 WIL.pas）
// 8 位索引色 + 256 色调色板 → RGBA ImageData → 离屏 canvas 缓存
// 加载：经全局调度器（5 并发 + 去重）拉取 512K 片段，一次性解包范围内所有图缓存。

import { PALETTE_RGBA, widthBytes, skipBytes } from './palette.mjs';
import { scheduler } from './scheduler.mjs';

const CHUNK_SIZE = 512 * 1024;   // 单次请求最大字节数

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
        this.sortedOffsets = [];     // 非空图偏移（递增），用于 chunk 边界对齐 + 二分查找
        this.fileSize = 0;           // wil 文件总大小（首个 fetch 的 Content-Range 获取）
        this.indexLoaded = false;
        this._indexLoading = null;   // 防重复加载索引
        this.textures = new Map();   // index -> { canvas, px, py, width, height }
        this.lastUse = new Map();    // index -> 最后使用时间戳
        this.memCheckTime = Date.now();
    }

    // 加载 WIX 索引（防并发重复）
    loadIndex() {
        if (this.indexLoaded) return Promise.resolve();
        if (this._indexLoading) return this._indexLoading;
        this._indexLoading = (async () => {
            const resp = await fetch(this.wixUrl);
            if (!resp.ok) throw new Error(`加载 ${this.wixUrl} 失败`);
            const buf = await resp.arrayBuffer();
            const view = new DataView(buf);
            this.imageCount = view.getUint32(44, true);
            for (let i = 0; i < this.imageCount; i++) {
                const off = view.getUint32(48 + i * 4, true);
                this.offsetList[i] = off < 1080 ? 0 : off;
                if (off >= 1080) this.sortedOffsets.push(off);
            }
            this.indexLoaded = true;
        })();
        return this._indexLoading;
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

        // 经全局调度器拉取片段（5 并发 + 去重）
        const end = this._chunkEnd(off);
        const { start, buffer, total } = await scheduler.schedule(this.wilUrl, off, end);
        if (total > this.fileSize) this.fileSize = total;

        // 一次性解包整个片段范围内的所有图（冗余缓存，后续请求直接命中）
        this._unpackRange(new DataView(buffer), start);

        return this.textures.get(index) || null;
    }

    // 计算 chunk 结束偏移：对齐到「第一个 >= start + CHUNK_SIZE 的图头」，
    // 保证 chunk 边界永远落在图片头，不截断任何一张图。
    _chunkEnd(start) {
        const target = start + CHUNK_SIZE;
        const arr = this.sortedOffsets;
        let lo = 0, hi = arr.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (arr[mid] < target) lo = mid + 1;
            else hi = mid;
        }
        if (lo < arr.length) return arr[lo];   // 第一个 >= target 的图头
        return this.fileSize > 0 ? this.fileSize : target;   // 末尾：对齐到文件末尾
    }

    // 解包 [start, start+buffer.byteLength) 范围内的所有图
    _unpackRange(view, start) {
        const viewEnd = start + view.byteLength;
        for (let i = 0; i < this.imageCount; i++) {
            const off = this.offsetList[i];
            if (off === 0 || off < start || off >= viewEnd) continue;
            if (this.textures.has(i)) continue;
            const tex = this._unpackOne(view, off - start, i);
            if (tex) {
                this.textures.set(i, tex);
                this.lastUse.set(i, Date.now());
            }
        }
    }

    // 解包单张图（图头在 buffer 的 localOff 处）
    _unpackOne(view, localOff, index) {
        let p = localOff;
        if (p + 8 > view.byteLength) return null;
        const width = view.getUint16(p, true); p += 2;
        const height = view.getUint16(p, true); p += 2;
        const px = view.getInt16(p, true); p += 2;
        const py = view.getInt16(p, true); p += 2;

        if (width <= 0 || height <= 0) return null;
        if (height === 1) return null;   // 1x1 占位图，旧代码跳过（视为空）

        // 位深：下一图偏移 - 本图偏移 判定（8 位或 16 位 RGB565）
        const fileOff = this.offsetList[index];
        const nextOff = this.offsetList[index + 1] || (fileOff + 8 + width * height);
        const bitCount = (nextOff - fileOff >= 8 + width * height * 2) ? 16 : 8;

        // 数据不足则跳过
        const dataLen = bitCount === 8 ? width * height : width * height * 2;
        if (p + dataLen > view.byteLength) return null;

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
