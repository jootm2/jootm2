// 入口（对应 mir2.dpr + ClMain.InitializeClient）
// 连接 WebSocket → 场景管理器 → 登录场景 → 选角 → 进游戏。

import { Connection } from './net/Connection.mjs';
import { SceneManager } from './scene/SceneManager.mjs';
import { LoginScene } from './ui/LoginScene.mjs';
import { Loop } from './core/loop.mjs';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from './core/config.mjs';
import { DWinManager } from './gui/manager.mjs';
import { loadResources } from './gfx/resource.mjs';
import { scheduler } from './gfx/scheduler.mjs';
import { getLib } from './image/Images.mjs';

const canvas = document.getElementById('screen');
canvas.width = SCREEN_WIDTH;
canvas.height = SCREEN_HEIGHT;
const ctx = canvas.getContext('2d');

// 全局屏蔽浏览器右键菜单（右键用于游戏跑动，任何界面包括 NPC 对话框都不弹菜单）
document.addEventListener('contextmenu', (e) => e.preventDefault());
// 全局禁用文本/元素框选与图片拖拽（按住移动时避免误选内容）
document.addEventListener('selectstart', (e) => e.preventDefault());
document.addEventListener('dragstart', (e) => e.preventDefault());

const guiEl = document.getElementById('gui');
const winManager = new DWinManager(guiEl);

async function init() {
    // 先加载资源索引（图片/地图/音频 URL）
    await loadResources();

    const conn = new Connection('/ws');
    try {
        await conn.connect();
    } catch (e) {
        console.error('[init] WebSocket 连接失败', e);
        const el = document.createElement('div');
        el.textContent = '无法连接服务器';
        el.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;'
            + 'color:#ff6b5e;font-size:16px;font-family:SimSun,serif;';
        guiEl.appendChild(el);
        return;
    }
    console.log('[init] WebSocket 已连接');

    const sceneManager = new SceneManager(conn, ctx, winManager);
    sceneManager.switchTo(new LoginScene(sceneManager));

    const loop = new Loop(() => {
        sceneManager.update(performance.now());
        sceneManager.render(ctx);
    });
    loop.start();

    // 调试接口
    window.__conn = conn;
    window.__sceneManager = sceneManager;
    window.__winManager = winManager;
    window.__scheduler = scheduler;
    window.__getLib = getLib;
}

init().catch(e => console.error('[init]', e));
