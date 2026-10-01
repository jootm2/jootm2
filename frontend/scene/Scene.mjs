// 场景基类（对应旧 TScene 概念）：登录 / 选角 / 游戏 等界面。
// 由 SceneManager 驱动生命周期 + 消息路由；render 画在游戏层 canvas，UI 用 DOM 控件。

export class Scene {
    constructor(manager) {
        this.manager = manager;
        this.conn = manager.conn;
    }

    /** 进入场景（加载资源、构建 UI） */
    onEnter() {}

    /** 离开场景（清理资源、移除 UI） */
    onExit() {}

    /** 收到一条服务端消息 */
    onMessage(type, msg) {}

    /** 每帧逻辑更新（ts = 时间戳） */
    update(ts) {}

    /** 每帧绘制（ctx = 游戏层 canvas 2d 上下文） */
    render(ctx) {}
}
