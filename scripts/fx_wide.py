# -*- coding: utf-8 -*-
"""Playwright：开半月空挥（真实 shift+左键），抓帧看刀气种类。"""
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


def swing_capture(page, prefix):
    """开抓帧器，shift+左键朝东空挥一次。"""
    page.evaluate("""
        window.__frames = [];
        window.__capturing = true;
        const canvas = document.getElementById('screen');
        let n = 0;
        function cap() {
            if (!window.__capturing || n >= 14) { window.__capturing = false; return; }
            const s = window.__sceneManager.current;
            window.__frames.push({ t: Date.now(), data: canvas.toDataURL('image/png'),
                sh: s.self._swordHit, act: s.self._action });
            n++;
            setTimeout(cap, 50);
        }
        cap();
    """)
    page.keyboard.down("Shift")
    time.sleep(0.1)
    page.mouse.move(500, 250)
    page.mouse.down()
    time.sleep(0.2)
    page.mouse.up()
    page.keyboard.up("Shift")
    page.wait_for_function("window.__capturing === false", timeout=20000)
    frames = page.evaluate("() => window.__frames")
    out = []
    for i, f in enumerate(frames):
        if f["sh"] or f["act"] != "stand":
            with open(f"/tmp/{prefix}_{i}.png", "wb") as fp:
                fp.write(base64.b64decode(f["data"].split(",", 1)[1]))
            out.append((i, f["sh"], f["act"]))
    return out


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 800, "height": 600})

        enter(page)

        # 1) 开半月空挥
        page.evaluate("window.__conn.send('castMagic', {magicId:25, targetX:0, targetY:0, targetId:0})")
        time.sleep(0.6)
        r = swing_capture(page, "fxw")
        print("[半月空挥]", r)

        # 关半月，开刺杀
        page.evaluate("window.__conn.send('castMagic', {magicId:25, targetX:0, targetY:0, targetId:0})")
        time.sleep(0.4)
        page.evaluate("window.__conn.send('castMagic', {magicId:12, targetX:0, targetY:0, targetId:0})")
        time.sleep(0.6)
        r = swing_capture(page, "fxl")
        print("[刺杀空挥]", r)

        browser.close()


if __name__ == "__main__":
    main()
