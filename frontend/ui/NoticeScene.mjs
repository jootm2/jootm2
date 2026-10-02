// notice（登录公告）场景 —— 黑屏 + 公告对话框（对齐旧版 TLoginNotice / stLoginNotice）
// 原版 TLoginNotice 无背景绘制（黑屏），DMessageDlg 弹公告消息框；确认后进 PlayScene。

import { Scene } from '../scene/Scene.mjs';
import { PlayScene } from '../scene/PlayScene.mjs';
import { getLib } from '../image/Images.mjs';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../core/config.mjs';

export class NoticeScene extends Scene {
    constructor(manager, name, lines) {
        super(manager);
        this.pendingName = name;   // 要进入的角色名（noticeOk 用）
        this.lines = lines || [];
        this._prgCache = new Map();
        this.root = null;
    }

    onEnter() {
        const gui = this.manager.winManager.container;
        gui.innerHTML = '';
        this.root = document.createElement('div');
        this.root.style.cssText = 'position:absolute;inset:0;pointer-events:auto;';
        gui.appendChild(this.root);
        this._build();
    }

    onExit() {
        if (this.root) this.root.remove();
    }

    // Prguse 图 → img URL（缓存）
    async _prgUrl(idx) {
        if (this._prgCache.has(idx)) return this._prgCache.get(idx);
        const lib = getLib('prguse');
        if (!lib) return null;
        const tex = await lib.getTexture(idx);
        if (!tex) return null;
        const url = tex.canvas.toDataURL
            ? tex.canvas.toDataURL('image/png')
            : URL.createObjectURL(await tex.canvas.convertToBlob());
        this._prgCache.set(idx, url);
        return url;
    }

    async _build() {
        const [bgUrl, okUrl] = await Promise.all([this._prgUrl(380), this._prgUrl(361)]);
        // 背景 Prguse[380]（256×359，居中）
        if (bgUrl) {
            const bg = document.createElement('img');
            bg.src = bgUrl;
            bg.draggable = false;
            bg.style.cssText = 'position:absolute;left:272px;top:120px;';
            this.root.appendChild(bg);
        }
        // 公告文本（从 23,20 开始）
        const text = document.createElement('div');
        text.style.cssText = 'position:absolute;left:295px;top:140px;width:210px;height:272px;'
            + 'font-family:SimSun,serif;font-size:14px;color:#f0e6c8;line-height:1.8;'
            + 'text-shadow:1px 1px 0 #000;text-align:left;';
        for (const l of this.lines) {
            const row = document.createElement('div');
            row.textContent = l;
            text.appendChild(row);
        }
        this.root.appendChild(text);
        // 确定按钮 Prguse[361]（90,305 相对背景）
        if (okUrl) {
            const ok = document.createElement('img');
            ok.src = okUrl;
            ok.draggable = false;
            ok.style.cssText = 'position:absolute;left:362px;top:425px;cursor:pointer;';
            ok.addEventListener('click', () => this.conn.send('noticeOk', { name: this.pendingName }));
            this.root.appendChild(ok);
        }
    }

    onMessage(type, msg) {
        if (type === 'enterGame') {
            this.manager.switchTo(new PlayScene(this.manager, msg));
        }
    }

    render(ctx) {
        // 黑屏
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    }
}
