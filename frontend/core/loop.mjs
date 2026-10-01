// 主循环（requestAnimationFrame，等价旧 Application.OnIdle）
// 每帧调用 update(timestamp)，内部时间戳驱动逻辑/动画（等价旧 GetTickCount 判断）

export class Loop {
    constructor(update) {
        this.update = update;
        this.running = false;
        this._rafId = 0;
    }

    start() {
        if (this.running) return;
        this.running = true;
        const tick = (ts) => {
            if (!this.running) return;
            try {
                this.update(ts);
            } catch (e) {
                console.error('[loop]', e);
            }
            this._rafId = requestAnimationFrame(tick);
        };
        this._rafId = requestAnimationFrame(tick);
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this._rafId);
    }
}
