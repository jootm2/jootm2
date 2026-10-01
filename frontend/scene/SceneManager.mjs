// 场景管理器：持有当前场景，驱动生命周期，并把服务端消息路由给当前场景。

import { Scene } from './Scene.mjs';

export class SceneManager {
    constructor(conn, ctx, winManager) {
        this.conn = conn;
        this.ctx = ctx;
        this.winManager = winManager;
        this.current = null;

        // 所有消息路由到当前场景
        conn.on('*', (msg) => {
            if (this.current) this.current.onMessage(msg.type, msg);
        });
    }

    switchTo(scene) {
        if (this.current) this.current.onExit();
        this.current = scene;
        if (scene) scene.onEnter();
    }

    update(ts) {
        if (this.current) this.current.update(ts);
    }

    render(ctx) {
        if (this.current) this.current.render(ctx);
    }
}
