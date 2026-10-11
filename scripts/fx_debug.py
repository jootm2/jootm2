# -*- coding: utf-8 -*-
"""Playwright 调试3：在浏览器内部抓帧（canvas.toDataURL），绕过截图慢的问题。"""
import base64, time
from playwright.sync_api import sync_playwright

URL = "http://localhost:8080/"


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 800, "height": 600})
        page.goto(URL, wait_until="load")
        page.wait_for_function("window.__conn && window.__conn.connected === true", timeout=15000)

        page.evaluate("window.__conn.send('login', {username:'test_warrior', password:'pass1234'})")
        page.wait_for_function("window.__sceneManager.current && window.__sceneManager.current.constructor.name === 'SelectCharScene'", timeout=8000)
        page.evaluate("window.__conn.send('enterGame', {name:'战士测试'})")
        page.wait_for_function("window.__sceneManager.current && window.__sceneManager.current.constructor.name === 'NoticeScene'", timeout=8000)
        page.evaluate("window.__conn.send('noticeOk', {name:'战士测试'})")
        page.wait_for_function("window.__sceneManager.current && window.__sceneManager.current.constructor.name === 'PlayScene'", timeout=8000)
        time.sleep(2.0)
        print("[ok] 进入游戏")

        # 开半月
        page.evaluate("window.__conn.send('castMagic', {magicId:25, targetX:0, targetY:0, targetId:0})")
        time.sleep(0.5)

        # 浏览器内抓帧器：每 60ms 抓一帧 canvas dataURL，抓 12 帧
        page.evaluate("""
            window.__frames = [];
            window.__capturing = true;
            const canvas = document.getElementById('screen');
            let n = 0;
            function cap() {
                if (!window.__capturing || n >= 12) { window.__capturing = false; return; }
                window.__frames.push({ t: Date.now(), data: canvas.toDataURL('image/png') });
                n++;
                setTimeout(cap, 60);
            }
            cap();
        """)

        # 方向攻击
        page.evaluate("window.__conn.send('dirAttack', {dir: 2})")

        # 等抓帧完成
        page.wait_for_function("window.__capturing === false", timeout=15000)

        # 取出帧并保存
        frames = page.evaluate("() => window.__frames.map(f => ({t: f.t, data: f.data}))")
        for i, f in enumerate(frames):
            d = base64.b64decode(f["data"].split(",", 1)[1])
            with open(f"/tmp/fxc_{i}.png", "wb") as fp:
                fp.write(d)
        # 状态
        st = page.evaluate("() => ({sh: window.__sceneManager.current.self._swordHit, act: window.__sceneManager.current.self._action, t0: window.__frames[0].t})")
        print("[status]", {k: st[k] for k in ('sh', 'act')})
        print("[ok] 保存", len(frames), "帧")

        browser.close()


if __name__ == "__main__":
    main()
