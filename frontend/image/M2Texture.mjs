// 纹理
class M2Texture {
    constructor(isEmpty, width, height, offsetX, offsetY, pixels) {
        // 是否空白
        this.isEmpty = isEmpty;
        // 宽度
        this.width = width;
        // 高度
        this.height = height;
        // 横向偏移
        this.offsetX = offsetX;
        // 纵向偏移
        this.offsetY = offsetY;
        // 像素RGBA，Uint8Array
        this.pixels = pixels;
    }

    // 预设的空纹理
    static Empty = new M2Texture(true, 1, 1, 0, 0, new Uint8Array([0, 0, 0, 0]));
}

export { M2Texture };