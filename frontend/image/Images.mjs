// WIL 图片库懒加载管理器（对应旧 Images.mjs）
// 按 key（tiles/smtiles/objects/mon1/hum/npc...）缓存 WIL 实例。

import { WIL } from '../gfx/wil.mjs';
import { imageUrls } from '../gfx/resource.mjs';

const cache = new Map();

export function getLib(key) {
    if (cache.has(key)) return cache.get(key);
    const urls = imageUrls(key);
    if (!urls) return null;
    const lib = new WIL(urls.wil, urls.wix);
    cache.set(key, lib);
    return lib;
}

/** 按需取纹理（返回 {canvas,px,py,width,height} 或 null） */
export async function getTexture(key, index) {
    const lib = getLib(key);
    if (!lib) return null;
    return lib.getTexture(index);
}
