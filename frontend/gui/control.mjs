// DControl 基类（对应旧 TDControl，DWinCtl.pas）
// GUI 层用 DOM 承载（div + img 背景懒加载），游戏层（地图/实体）用 canvas 轮询绘制。
// 透明按钮通过 onInRealArea 回调做不规则命中判定。

let _uid = 0;

export class DControl {
    constructor(manager, parent = null) {
        this.manager = manager;
        this.id = ++_uid;

        this.el = document.createElement('div');
        this.el.className = 'd-control';
        this.el.style.position = 'absolute';
        this.el.style.overflow = 'hidden';
        this.el.style.userSelect = 'none';
        this.el.style.display = 'none';   // 默认隐藏，visible 后显示
        this.el.__control = this;         // 供 manager 用 elementFromPoint 反向定位控件

        // 背景 img（懒加载）
        this.bgImg = document.createElement('img');
        this.bgImg.style.position = 'absolute';
        this.bgImg.style.left = '0';
        this.bgImg.style.top = '0';
        this.bgImg.style.pointerEvents = 'none';
        this.bgImg.draggable = false;
        this.el.appendChild(this.bgImg);

        // 属性
        this.dParent = parent;        // 父控件（相对定位）
        this.visible = false;
        this.enableFocus = false;
        this.background = false;      // 背景层：点击穿透到下层
        this.caption = '';
        this.wlib = null;             // WIL 容器
        this.faceIndex = -1;          // 背景图索引

        this.children = [];           // 子控件

        // 事件回调（对应旧 On*）
        this.onDirectPaint = null;
        this.onMouseDown = null;
        this.onMouseMove = null;
        this.onMouseUp = null;
        this.onClick = null;
        this.onInRealArea = null;     // (x, y) -> boolean 不规则命中

        // 位置尺寸
        this.left = 0;
        this.top = 0;
        this.width = 0;
        this.height = 0;

        if (parent) parent.addChild(this);
    }

    addChild(child) {
        this.children.push(child);
        this.el.appendChild(child.el);
    }

    // 设置位置尺寸
    setBounds(left, top, width, height) {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
        this._apply();
    }

    _apply() {
        this.el.style.left = this.left + 'px';
        this.el.style.top = this.top + 'px';
        this.el.style.width = this.width + 'px';
        this.el.style.height = this.height + 'px';
        this.el.style.display = this.visible ? 'block' : 'none';
    }

    setVisible(v) {
        this.visible = v;
        this._apply();
    }

    show() { this.setVisible(true); }
    hide() { this.setVisible(false); }

    // 懒加载背景图：设置 WIL 容器 + 图索引，异步加载后显示
    // 未加载完成时背景透明（空图片）
    async setFace(wlib, faceIndex) {
        this.wlib = wlib;
        this.faceIndex = faceIndex;
        if (!wlib || faceIndex < 0) {
            this.bgImg.src = '';
            return;
        }
        const tex = await wlib.getTexture(faceIndex);
        if (tex) {
            const url = await this._canvasToURL(tex.canvas);
            if (url) {
                this.bgImg.src = url;
                this.bgImg.style.width = tex.width + 'px';
                this.bgImg.style.height = tex.height + 'px';
            }
        }
    }

    // 离屏 canvas 转 URL（供 img 使用）
    async _canvasToURL(canvas) {
        if (canvas.toDataURL) return canvas.toDataURL('image/png');
        if (canvas.convertToBlob) {
            const blob = await canvas.convertToBlob();
            return URL.createObjectURL(blob);
        }
        return null;
    }

    // 本地坐标（相对控件）
    localX(x) { return x - this.left; }
    localY(y) { return y - this.top; }

    // 命中判定：先 onInRealArea（不规则），否则矩形命中
    hitTest(x, y) {
        if (!this.visible) return false;
        const lx = this.localX(x);
        const ly = this.localY(y);
        if (lx < 0 || ly < 0 || lx >= this.width || ly >= this.height) return false;
        if (this.onInRealArea) {
            let isReal = true;
            const r = this.onInRealArea(lx, ly);
            return r === undefined ? true : r;
        }
        return true;
    }

    // 提升 z-index（点击置顶）
    bringToFront() {
        const z = this.manager.nextZ();
        this.el.style.zIndex = z;
        return z;
    }

    destroy() {
        this.el.remove();
    }
}
