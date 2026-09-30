import { GB2312Encoder } from "./GB2312Encoder.mjs"

class EDcode {
    constructor(buffer_size) {
        this.buffer_size = buffer_size
        this.encode_offset = 0x3C
        this.masks = [0, 0, 0xFC, 0xF8, 0xF0, 0xE0, 0xC0]
    }

    encode6BitBuf(src) {
        let restCount = 0;
        let rest = 0;
        const dest = [];

        for (let i = 0; i < src.length; i++) {
            const ch = src[i];
            // 计算当前6位段
            const made = (rest | (ch >> (2 + restCount))) & 0x3F;
            rest = ((ch << (8 - (2 + restCount))) >> 2) & 0x3F;

            restCount += 2;
            if (restCount < 6) {
                dest.push(made + this.encode_offset);
            } else {
                dest.push(made + this.encode_offset);
                dest.push(rest + this.encode_offset);
                restCount = 0;
                rest = 0;
            }
        }

        // 处理剩余未编码的位
        if (restCount > 0) {
            dest.push(rest + this.encode_offset);
        }

        // 转换为ASCII字符串返回
        return String.fromCharCode(...dest);
    }

    decode6BitBuf(source, bufSize) {
        const len = source.length;
        let bitPos = 2;
        let madeBit = 0;
        const buf = new Uint8Array(bufSize);
        let bufPos = 0;
        let tmp = 0;

        for (let i = 0; i < len; i++) {
            // 校验编码字符范围并转换为原始6位值
            const charCode = source.charCodeAt(i);
            let ch = charCode - this.encode_offset;
            if (ch < 0 || ch > 0x3F) { // 非法编码字符，直接返回空
                bufPos = 0;
                break;
            }

            if (bufPos >= bufSize) break;

            // 拼接完整字节（8位）
            if (madeBit + 6 >= 8) {
                let _byte = tmp | ((ch & 0x3F) >> (6 - bitPos));
                if (_byte == 27) {
                    _byte = 92//'\\'
                }
                buf[bufPos++] = _byte;
                madeBit = 0;

                if (bitPos < 6) {
                    bitPos += 2;
                } else {
                    bitPos = 2;
                    continue;
                }
            }

            tmp = (ch << bitPos) & this.masks[bitPos];
            madeBit += 8 - bitPos;
        }

        // 返回有效长度的字节数组（去除空值）
        return buf.slice(0, bufPos);
    }

    // 将字符串编码为可发送到服务器的ascii字符串
    encode_string(str) {
        // 将字符串转换为UTF-8字节数组
        const encoder = new GB2312Encoder();
        const src = encoder.encode(str);
        return this.encode6BitBuf(src);
    }

    // 将Uint8Array编码为可发送到服务器的ascii字符串
    encode_buffer(buf) {
        if (buf.length > this.buffer_size) return "";
        return this.encode6BitBuf(buf);
    }

    // 从服务器发送的字符串解码为Uint8Array
    // 如果包含中文，需要使用GBK进行解码
    decode_string(str) {
        return this.decode6BitBuf(str, this.buffer_size);
    }

    // 构建消息头
    make_default_msg(...args) {
        let ident = 0;
        if (args.length > 0) {
            ident = args[0];
        }
        let recog = 0;
        if (args.length > 1) {
            recog = args[1];
        }
        let wparam = 0;
        if (args.length > 2) {
            wparam = args[2];
        }
        let atag = 0;
        if (args.length > 3) {
            atag = args[3];
        }
        let nseries = 0;
        if (args.length > 4) {
            nseries = args[4];
        }
        const buffer = new ArrayBuffer(12);
		const dataView = new DataView(buffer);
		dataView.setInt32(0, recog, true); // 第三个参数 true = 小端序
		dataView.setInt16(4, ident, true);  // 偏移4：占 4~5 字节
		dataView.setInt16(6, wparam, true);  // 偏移6：占 6~7 字节
		dataView.setInt16(8, atag, true);  // 偏移8：占 8~9 字节
		dataView.setInt16(10, nseries, true); // 偏移10：占 10~11 字节

		return this.encode6BitBuf(new Uint8Array(buffer));
    }

    decode_message(msg_str) {
        const buf = this.decode_string(msg_str.substring(0, 16));
        const data_view = new DataView(buf.buffer);
        return {
            recog: data_view.getInt32(0, true),
            ident: data_view.getInt16(4, true),
            wparam: data_view.getInt16(6, true),
            atag: data_view.getInt16(8, true),
            nseries: data_view.getInt16(10, true),
        };
    }
}

export { EDcode }