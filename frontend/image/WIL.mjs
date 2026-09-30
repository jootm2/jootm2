import * as SDK from "../SDK.mjs"
import { M2Texture } from "./M2Texture.mjs"

class WIL {
    constructor(wixUrl, wilUrl) {
        // 图片库图片总数
        this.imageCount = 0;
        // 每幅图片数据在wil文件中的偏移量
        this.offsetList = [];

        // 当异步加载图片成功时的回调函数（每幅图片都会回调一次）
        this.textureConsumer = null;

        // wix文件地址
        this.wixUrl = wixUrl;
        // wil文件地址
        this.wilUrl = wilUrl;
        // 是否正在异步加载图片
        this.loading = false;
        // 已加载完成的纹理序号集合
        this.loadedNos = new Set;
    }

    // 设置单个纹理加载成功的回调函数
    // 函数原型为 function callback(no : Number, tex : M2Texture)
    // no=>纹理在图片库中的序号，tex=>纹理对象
    onTextureLoad(textureConsumer) {
        this.textureConsumer = textureConsumer;
    }

    // 从wilData数据中解压纹理
    // 如果是片段数据，texOffset需要给定值，表示起始的文件偏移
    unpackTexturesData(wilData, texOffset = 0) {
        const unpack4Chunk = texOffset != 0;

        // 找到纹理序号
        let no = 0;
        if (unpack4Chunk) {
            for (;no < this.imageCount; ++no) {
                if (this.offsetList[no] == texOffset) {
                    break;
                }
            }
        }

        this.offsetList[this.imageCount] = wilData.byteLength;
        if (unpack4Chunk) {
            this.offsetList[this.imageCount] += this.offsetList[no];
        }

        // 当前数据相对于wil文件的偏移量
        let chunkOffset = 0;
        if (unpack4Chunk) {
            chunkOffset = this.offsetList[no];
        }

        const byteBuffer = new DataView(wilData);
        for (;no < this.imageCount; ++no) {
            let offset = this.offsetList[no];
            if (offset == 0) {
                // 某种原因的空图片
                this.loadedNos.add(no);
                if (this.textureConsumer != null) {
                    this.textureConsumer(no, M2Texture.Empty);
                }
                continue;
            }
            if (unpack4Chunk) {
                // 矫正数据起始索引
                offset -= chunkOffset;
            }
            if (offset + 9 > wilData.byteLength) {
                // 可能是数据不足
                if (unpack4Chunk) break;
                // 数据出错
                this.loadedNos.add(no);
                if (this.textureConsumer != null) {
                    this.textureConsumer(no, M2Texture.Empty);
                }
                continue;
            }

            const width = byteBuffer.getUint16(offset, true);
            const height = byteBuffer.getUint16(offset + 2, true);
            if (/*width == 1 && */height == 1) { // 1x1或4x1我们不要它
                this.loadedNos.add(no);
                if (this.textureConsumer != null) {
                    this.textureConsumer(no, M2Texture.Empty);
                }
                continue;
            }
            const offsetX = byteBuffer.getInt16(offset + 4, true);
            const offsetY = byteBuffer.getInt16(offset + 6, true);

            // 判断图片位深
            let bitCount = 8;
            if (this.offsetList[no + 1] - this.offsetList[no] >= 8 + width * height * 2) {
                bitCount = 16;
            }

            if (unpack4Chunk) {
                // 数据不足
                if (offset + 8 + width * height * bitCount / 8 > wilData.byteLength) break;
            }

            const sRGBA = new Uint8Array(width * height * 4);
            if (bitCount == 8) {
                const pixelLength = this.offsetList[no + 1] - this.offsetList[no] - 8;
                const padding = pixelLength != width * height && pixelLength == SDK.widthBytes(8 * width) * height;

                let p_index = offset + 8;
                const pixels = new Uint8Array(wilData);
                for (let h = height - 1; h >= 0; --h) {
                    for (let w = 0; w < width; ++w) {
                        // 跳过填充字节
                        if (padding && w == 0)
                            p_index += SDK.skipBytes(8, width);
                        const pallete = SDK.Palletes[pixels[p_index++] & 0xff];
                        const _idx = (w + h * width) * 4;
                        sRGBA[_idx] = pallete[1];//r
                        sRGBA[_idx + 1] = pallete[2];//g
                        sRGBA[_idx + 2] = pallete[3];//b
                        sRGBA[_idx + 3] = pallete[0];//a
                    }
                }
            } else if (bitCount == 16) {
                const pixelLength = this.offsetList[no + 1] - this.offsetList[no] - 8;
                const padding = pixelLength != width * height * 2 && pixelLength == SDK.widthBytes(8 * width) * height * 2;

                let p_index = offset + 8;
                for (let h = height - 1; h >= 0; --h) {
                    for (let w = 0; w < width; ++w, p_index += 2) {
                        // 跳过填充字节
                        if (padding && w == 0)
                            p_index += SDK.skipBytes(16, width);
                        const pdata = byteBuffer.getUint16(p_index, true);
                        const r = (pdata & 0xf800) >> 8;// 由于是与16位做与操作，所以多出了后面8位
                        const g = (pdata & 0x7e0) >> 3;// 多出了3位，在强转时前8位会自动丢失
                        const b = (pdata & 0x1f) << 3;// 少了3位
                        const _idx = (w + h * width) * 4;
                        sRGBA[_idx + 0] = r;
                        sRGBA[_idx + 1] = g;
                        sRGBA[_idx + 2] = b;
                        if (r == 0 && g == 0 && b == 0) {
                            sRGBA[_idx + 3] = 0;
                        } else {
                            sRGBA[_idx + 3] = -1;
                        }
                    }
                }
            }
            this.loadedNos.add(no);
            if (this.textureConsumer != null) {
                this.textureConsumer(no, new M2Texture(false, width, height, offsetX, offsetY, sRGBA));
            }
        }
    }

    // 异步加载某个图片
    // 实际上可能会将随后的多副图片一起加载
    // 因为一次网络交互传递数据太少比较亏
    async load(idx) {
        if (this.loadedNos.has(idx)) return;
        if (this.loading) return;

        this.loading = true;
        do {
            if (this.imageCount == 0) {
                // 需要先解析wix文件
                let wixData = null;
                try {
                    const respWix = await fetch(this.wixUrl);
                    if (!respWix.ok) return;
                        wixData = await respWix.arrayBuffer();
                } catch {
                    break;
                }
                const uint32Arr = new DataView(wixData);
                this.imageCount = uint32Arr.getUint32(44, true);
                for (let i = 0; i < this.imageCount; ++i) {
                    this.offsetList[i] = uint32Arr.getUint32(48 + i * 4, true);
                    if (this.offsetList[i] < 1080) {
                        this.offsetList[i] = 0;
                    }
                }
                this.offsetList.push(0xFFFFFFFF);
            }
            if (idx >= this.imageCount) break;
            let wilData = null;
            {
                try {
                    // 先尝试获取片段
                    const headers = { Range: `bytes=${this.offsetList[idx]}-${this.offsetList[idx] + 512 * 1024}` }; // 加载至多512K数据
                    const response = await fetch(this.wilUrl, { headers });
                    if (response.status === 206) {
                        wilData = await response.arrayBuffer();
                    }
                } catch { }
            }
            if (wilData) {
                // 如果片段加载成功
                this.unpackTexturesData(wilData, this.offsetList[idx]);
                break;
            }
            // 如果片段加载失败，只能拉整个文件了
            {
                try {
                    const respWil = await fetch(this.wilUrl);
                    if (!respWil.ok) return;
                    wilData = await respWil.arrayBuffer();
                } catch {
                    break;
                }
            }
            this.unpackTexturesData(wilData);
        } while (false);
        this.loading = false;
    }
}

export { WIL };