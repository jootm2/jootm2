// 资源清单：从服务端 resources.json 加载图片库 / 地图 URL 映射
// 对应旧代码 WIL 文件路径（Data\*.wil / Map\*.map）

let _images = null;   // { key: { x: wix路径, l: wil路径 } }
let _maps = null;     // { mapId: map路径 }

export async function loadResources() {
    const resp = await fetch('/resources/resources.json');
    if (!resp.ok) throw new Error('加载 resources.json 失败');
    const data = await resp.json();
    _images = data.images || {};
    _maps = data.maps || {};
    return data;
}

// 取图片库 URL（key 如 'tiles'/'hum'/'mon1'）
export function imageUrls(key) {
    const img = _images?.[key];
    if (!img) return null;
    return { wil: `/resources/${img.l}`, wix: `/resources/${img.x}` };
}

// 取地图文件 URL
export function mapUrl(mapId) {
    const m = _maps?.[mapId];
    return m ? `/resources/${m}` : null;
}
