// DWinManager 窗口管理器（对应旧 TDWinManager）
// 管理所有控件，分发鼠标/键盘事件（UI 优先），处理 z-index 置顶、模态、拖动

import { DControl } from './control.mjs';

export class DWinManager {
    constructor(container) {
        this.container = container;      // 承载 GUI 的 DOM 元素（覆盖在 canvas 上）
        this.winList = [];               // 所有控件
        this._z = 100;                   // z-index 计数器
        this.modalWindow = null;         // 模态窗口
        this.focusedControl = null;      // 键盘焦点
        this._mouseCapture = null;       // 鼠标捕获
        this._dragWindow = null;         // 正在拖动的窗口

        // 在容器上监听事件（统一分发）
        this._bindEvents();
    }

    nextZ() {
        return ++this._z;
    }

    addDControl(control, visible = false) {
        this.winList.push(control);
        this.container.appendChild(control.el);
        control.setVisible(visible);
    }

    delDControl(control) {
        const i = this.winList.indexOf(control);
        if (i >= 0) this.winList.splice(i, 1);
        control.destroy();
    }

    setModal(win) {
        this.modalWindow = win;
        if (win) {
            // 模态遮罩
            if (!this._mask) {
                this._mask = document.createElement('div');
                this._mask.style.position = 'absolute';
                this._mask.style.left = '0';
                this._mask.style.top = '0';
                this._mask.style.width = '100%';
                this._mask.style.height = '100%';
                this._mask.style.background = 'rgba(0,0,0,0.5)';
                this._mask.style.zIndex = this.nextZ();
                this.container.appendChild(this._mask);
            }
            win.el.style.zIndex = this.nextZ();
        }
    }

    clearModal() {
        this.modalWindow = null;
        if (this._mask) {
            this._mask.remove();
            this._mask = null;
        }
    }

    _bindEvents() {
        this.container.addEventListener('mousedown', (e) => this._onMouseDown(e));
        this.container.addEventListener('mousemove', (e) => this._onMouseMove(e));
        this.container.addEventListener('mouseup', (e) => this._onMouseUp(e));
    }

    // 用浏览器原生 elementFromPoint 找命中的控件（自动处理 z-index/坐标/裁剪/子控件）
    _hitTest(x, y) {
        if (this.modalWindow) {
            // 模态时只有模态窗口可交互
            const rect = this.container.getBoundingClientRect();
            const el = document.elementFromPoint(rect.left + x, rect.top + y);
            let node = el;
            while (node && node !== this.container) {
                if (node.__control === this.modalWindow) return this.modalWindow;
                node = node.parentElement;
            }
            return null;
        }
        const rect = this.container.getBoundingClientRect();
        const el = document.elementFromPoint(rect.left + x, rect.top + y);
        let node = el;
        while (node && node !== this.container) {
            if (node.__control) return node.__control;
            node = node.parentElement;
        }
        return null;
    }

    _onMouseDown(e) {
        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const hit = this._hitTest(x, y);
        if (!hit) return;   // 未命中 UI，事件交给场景（canvas）

        // 置顶 + 焦点
        if (hit.enableFocus) this.focusedControl = hit;
        if (hit.dragging !== undefined) {
            hit.dragging = true;
            this._dragWindow = hit;
        }

        const { lx, ly } = this._localXY(hit, e);
        if (hit.onMouseDown) hit.onMouseDown(lx, ly, e.button);
        if (hit.onClick || hit.handleClick) this._clickControl = hit;
        e.stopPropagation();
    }

    // 计算事件相对命中控件的本地坐标（用 getBoundingClientRect，兼容子控件相对父控件定位）
    _localXY(hit, e) {
        const hr = hit.el.getBoundingClientRect();
        return { lx: e.clientX - hr.left, ly: e.clientY - hr.top };
    }

    _onMouseMove(e) {
        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // 拖动
        if (this._dragWindow) {
            this._dragWindow.onGlobalMouseMove(x, y);
        }

        const hit = this._hitTest(x, y);
        if (hit && hit.onMouseMove) {
            const { lx, ly } = this._localXY(hit, e);
            hit.onMouseMove(lx, ly);
        }
    }

    _onMouseUp(e) {
        if (this._dragWindow) {
            this._dragWindow.onGlobalMouseUp();
            this._dragWindow = null;
        }
        if (this._clickControl) {
            const c = this._clickControl;
            this._clickControl = null;
            const { lx, ly } = this._localXY(c, e);
            if (c.handleClick) {
                c.handleClick(lx, ly);   // DGrid 等有格子命中逻辑
            } else if (c.onClick) {
                c.onClick(lx, ly);
            }
        }
    }

    // 键盘事件分发（由外部调用，返回 true 表示 UI 消费）
    keyDown(key) {
        if (this.focusedControl && this.focusedControl.onKeyDown) {
            return this.focusedControl.onKeyDown(key) === true;
        }
        return false;
    }

    keyPress(key) {
        if (this.focusedControl && this.focusedControl.onKeyPress) {
            return this.focusedControl.onKeyPress(key) === true;
        }
        return false;
    }
}
