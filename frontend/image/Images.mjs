import { WIL } from "./WIL.mjs"
import * as PIXI from "../pixi.mjs"

// 图片库的地址，每个图片库都有两个地址，wix/wzx和wil/wzl
const libUrls = new Map
// 图片加载器，每一个图片库对应一个，可能是WIL，也可能是WZL
const loaders = new Map
// 当异步加载图片成功时的回调函数（每幅图片都会回调一次）
let textureConsumer = null
// 图片加载的类
class Images {

    // 设置单个纹理加载成功的回调函数
    // 函数原型为 function callback(libName, no : Number, tex : M2Texture)
    // libName=>图片库名称，no=>纹理在图片库中的序号，tex=>纹理对象
    static onTextureLoad(callback) {
        textureConsumer = callback;
    }

    static setLibraryUrl(libName, indexFileUrl, libraryFileUrl) {
        const libUrl = new Map
        libUrl.set("x", indexFileUrl)
        libUrl.set("l", libraryFileUrl)
        libUrls.set(libName, libUrl)
    }

    static load(libName, imageNo) {
        if (!libUrls.has(libName)) {
            console.warn(`${libName} does not exists, please call setLibraryUrl to set file address first`)
            return;
        }
        if (!loaders.has(libName)) {
            const libUrl = libUrls.get(libName)
            const indexFileUrl = libUrl.get("x")
            const libraryFileUrl = libUrl.get("l")
            if (indexFileUrl.toLowerCase().endsWith("wix")) {
                const wil = new WIL(indexFileUrl, libraryFileUrl)
                wil.onTextureLoad((no, tex) => {
                    const pixiTex = PIXI.BaseTexture.fromBuffer(tex.pixels, tex.width, tex.height);
                    if (pixiTex) {
                        globalThis.BaseTextureCache[`${libName}/${no}`] = pixiTex
                    }
                    if (textureConsumer != null) {
                        textureConsumer(libName, no, tex)
                    }
                })
                loaders.set(libName, wil)
            } // else TODO wzl
        }
        loaders.get(libName).load(imageNo)
    }
}

export { Images }