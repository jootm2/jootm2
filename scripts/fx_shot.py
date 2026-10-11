# -*- coding: utf-8 -*-
"""Playwright 截图测试：进入游戏 → 开半月 → 方向攻击 → 截图检查战士打击光效。"""
import sys, time
from playwright.sync_api import sync_playwright

URL = "http://localhost:8080/"


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 800, "height": 600})
        page.goto(URL, wait_until="load")
        page.wait_for_function("window.__conn && window.__conn.connected === true", timeout=15000)
        print("[ok] WebSocket 已连接")

        # 登录 → 选角场景
        page.evaluate("window.__conn.send('login', {username:'test_warrior', password:'pass1234'})")
        page.wait_for_function("window.__sceneManager.current && window.__sceneManager.current.constructor.name === 'SelectCharScene'", timeout=8000)
        print("[ok] 进入选角场景")

        # 进入游戏（enterGame → notice → noticeOk）
        page.evaluate("window.__conn.send('enterGame', {name:'战士测试'})")
        page.wait_for_function("window.__sceneManager.current && window.__sceneManager.current.constructor.name === 'NoticeScene'", timeout=8000)
        page.evaluate("window.__conn.send('noticeOk', {name:'战士测试'})")
        page.wait_for_function("window.__sceneManager.current && window.__sceneManager.current.constructor.name === 'PlayScene'", timeout=8000)
        print("[ok] 进入游戏场景")

        # 等待地图/实体就绪
        time.sleep(2.0)

        # 读取当前 PlayScene 状态
        st = page.evaluate("""() => {
            const s = window.__sceneManager.current;
            const self = s.self;
            const monsters = [...s.entities.values()].filter(e => e.type === 'monster' && e.hp > 0);
            return {
                self: { id: self.id, x: self.x, y: self.y, dir: self.dir, _longHit: self._longHit, _wideHit: self._wideHit },
                monsterCount: monsters.length,
                nearest: monsters.length ? (() => { const m = monsters[0]; return {id:m.id, x:m.x, y:m.y, name:m.name}; })() : null,
            };
        }""")
        print("[info] 玩家状态:", st["self"])
        print("[info] 附近怪物数:", st["monsterCount"], "最近:", st["nearest"])

        # 开半月
        page.evaluate("window.__conn.send('castMagic', {magicId:25, targetX:0, targetY:0, targetId:0})")
        time.sleep(0.5)

        # 触发方向攻击（shift 方向攻击，空挥也持续）——发一次，服务端广播 attack 带 swordHit
        page.evaluate("window.__conn.send('dirAttack', {dir: 2})")

        # 光效只持续约 510ms，连续截图抓取
        shots = []
        for i in range(6):
            time.sleep(0.09)
            data = page.screenshot()
            fn = f"/tmp/fx_shot_{i}.png"
            with open(fn, "wb") as f:
                f.write(data)
            shots.append(fn)
        print("[ok] 截图保存:", shots)

        browser.close()


if __name__ == "__main__":
    main()
