// 入口（对应 mir2.dpr + ClMain.InitializeClient）
import { loadResources, imageUrls } from './gfx/resource.mjs';
import { WIL } from './gfx/wil.mjs';
import { Loop } from './core/loop.mjs';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from './core/config.mjs';
import { DWinManager } from './gui/manager.mjs';
import { DWindow } from './gui/window.mjs';
import { DButton } from './gui/button.mjs';
import { DGrid } from './gui/grid.mjs';

const canvas = document.getElementById('screen');
canvas.width = SCREEN_WIDTH;
canvas.height = SCREEN_HEIGHT;
const ctx = canvas.getContext('2d');

const guiEl = document.getElementById('gui');
const winManager = new DWinManager(guiEl);

// 全局图库（后续场景共用）
const libs = {};

async function init() {
    await loadResources();

    // 加载 Tiles（游戏层）+ Prguse（GUI 层）
    const tilesUrls = imageUrls('tiles');
    libs.tiles = new WIL(tilesUrls.wil, tilesUrls.wix);
    const prgUrls = imageUrls('prguse');
    libs.prguse = new WIL(prgUrls.wil, prgUrls.wix);

    const tex = await libs.tiles.getTexture(0);
    console.log('[init] Tiles[0] =', tex ? `${tex.width}x${tex.height}` : '加载失败');

    // 主循环：canvas 游戏层
    const loop = new Loop(() => {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
        if (tex) ctx.drawImage(tex.canvas, 50, 50);
    });
    loop.start();

    // === GUI 演示 ===

    // 窗口 1：带背景窗框 + 网格（模拟背包）
    const win = new DWindow(winManager);
    win.setBounds(80, 60, 300, 220);
    winManager.addDControl(win, true);
    win.setFace(libs.prguse, 0);

    const grid = new DGrid(winManager, win);
    grid.setBounds(20, 20, 6 * 36, 4 * 33);
    grid.setGrid(6, 4, 36, 33);
    grid.onGridPaint = (col, row, gctx) => {
        gctx.fillStyle = (col + row) % 2 ? '#1a1a1a' : '#222';
        gctx.fillRect(col * 36, row * 33, 36, 33);
        gctx.strokeStyle = '#333';
        gctx.strokeRect(col * 36, row * 33, 36, 33);
    };
    grid.onGridSelect = (col, row) => {
        console.log(`[grid] 点击格子 (${col}, ${row})`);
        window.__lastGrid = `(${col},${row})`;
    };
    grid.setVisible(true);
    grid.paint();

    // 窗口 2：带按钮
    const win2 = new DWindow(winManager);
    win2.setBounds(450, 200, 220, 160);
    winManager.addDControl(win2, true);
    win2.setFace(libs.prguse, 1);

    const btn = new DButton(winManager, win2);
    btn.setBounds(20, 30, 80, 30);
    btn.setVisible(true);
    btn.el.style.background = '#555';
    btn.el.style.border = '1px solid #888';
    btn.el.style.cursor = 'pointer';
    btn.onClick = () => {
        console.log('[button] 按钮被点击');
        window.__btnClicked = (window.__btnClicked || 0) + 1;
    };

    console.log('[init] GUI 演示就绪（窗口/网格/按钮）');
    window.__libs = libs;
    window.__winManager = winManager;
}

init().catch(e => console.error('[init]', e));
