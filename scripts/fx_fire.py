# -*- coding: utf-8 -*-
"""Playwright：烈火 + 攻杀 特效测试。"""
import base64, time
from playwright.sync_api import sync_playwright

URL = "http://localhost:8080/"


def enter(page):
    page.goto(URL, wait_until="load")
    page.wait_for_function("window.__conn && window.__conn.connected === true", timeout=15000)
    page.evaluate("window.__conn.send('login', {username:'test_warrior', password:'pass1234'})")
    page.wait_for_function("window.__sceneManager.current && window.__sceneManager.current.constructor.name === 'SelectCharScene'", timeout=8000)
    page.evaluate("window.__conn.send('enterGame', {name:'战士测试'})")
    page.wait_for_function("window.__sceneManager.current && window.__sceneManager.current.constructor.name === 'NoticeScene'", timeout=8000)
    page.evaluate("window.__conn.send('noticeOk', {name:'战士测试'})")
    page.wait_for_function("window.__sceneManager.current && window.__sceneManager.current.constructor.name === 'PlayScene'", timeout=8000)
    time.sleep(2.0)


def capture(page, prefix, n=12, interval=60):
    page.evaluate(f"""
        window.__frames = [];
        window.__capturing = true;
        const canvas = document.getElementById('screen');
        let n = 0;
        function cap() {{
            if (!window.__capturing || n >= {n}) {{ window.__capturing = false; return; }}
            window.__frames.push({{ t: Date.now(), data: canvas.toDataURL('image/png') }});
            n++;
            setTimeout(cap, {interval});
        }}
        cap();
    """)


def save(page, prefix):
    page.wait_for_function("window.__capturing === false", timeout=20000)
    frames = page.evaluate("() => window.__frames.map(f => ({t: f.t, data: f.data}))")
    for i, f in enumerate(frames):
        d = base64.b64decode(f["data"].split(",", 1)[1])
        with open(f"/tmp/{prefix}_{i}.png", "wb") as fp:
            fp.write(d)
    return len(frames)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 800, "height": 600})

        # ---- 烈火：蓄力后方向攻击 ----
        enter(page)
        page.evaluate("window.__conn.send('castMagic', {magicId:26, targetX:0, targetY:0, targetId:0})")
        time.sleep(0.6)
        st = page.evaluate("() => ({fire: window.__sceneManager.current.self._fireHit, sys: document.querySelector('#gui') ? 'ok' : '?'})")
        print("[烈火蓄力] self._fireHit =", st["fire"])
        capture(page, "fxfire")
        page.evaluate("window.__conn.send('dirAttack', {dir: 2})")
        n = save(page, "fxfire")
        print("[烈火] 保存", n, "帧")

        # ---- 攻杀：被动触发（攻击多次看随机触发） ----
        page.evaluate("window.__conn.send('castMagic', {magicId:25, targetX:0, targetY:0, targetId:0})")  # 关半月避免干扰
        time.sleep(0.3)
        capture(page, "fxpower")
        for i in range(3):
            page.evaluate("window.__conn.send('dirAttack', {dir: 2})")
            time.sleep(0.65)
        n = save(page, "fxpower")
        print("[攻杀] 保存", n, "帧")

        browser.close()


if __name__ == "__main__":
    main()
