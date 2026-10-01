// WebSocket 连接封装（对接后端 /ws 的 JSON 协议，见 HANDOFF §7）
// 收发均为 {type, ...} JSON；按 type 分发回调，支持 '*' 通配。

export class Connection {
    constructor(url = '/ws') {
        this.url = url;
        this.ws = null;
        this.connected = false;
        this._handlers = new Map();   // type -> [handler]
        this.onOpen = null;
        this.onClose = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(this.url);
            this.ws = ws;
            ws.onopen = () => {
                this.connected = true;
                if (this.onOpen) this.onOpen();
                resolve();
            };
            ws.onerror = (e) => reject(e);
            ws.onclose = () => {
                this.connected = false;
                if (this.onClose) this.onClose();
            };
            ws.onmessage = (e) => this._dispatch(e.data);
        });
    }

    /** 发送 {type, ...payload} */
    send(type, payload = {}) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
        this.ws.send(JSON.stringify({ type, ...payload }));
        return true;
    }

    /** 注册某类消息的处理器 */
    on(type, handler) {
        if (!this._handlers.has(type)) this._handlers.set(type, []);
        this._handlers.get(type).push(handler);
    }

    close() {
        if (this.ws) this.ws.close();
    }

    _dispatch(raw) {
        let msg;
        try {
            msg = JSON.parse(raw);
        } catch {
            return;
        }
        const hs = this._handlers.get(msg.type);
        if (hs) for (const h of hs) h(msg);
        const wild = this._handlers.get('*');
        if (wild) for (const h of wild) h(msg);
    }
}
