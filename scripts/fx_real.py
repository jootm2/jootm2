# -*- coding: utf-8 -*-
"""Playwright：真实模拟 shift+左键 空挥，抓帧看刺杀刀气。"""
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


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 800, "height": 600})

        enter(page)

        # 监听 attack 消息
        page.evaluate("""
            window.__attackMsgs = [];
            window.__conn.on('attack', (m) => window.__attackMsgs.push({t: Date.now(), swordHit: m.swordHit, targetId: m.targetId}));
            window.__conn.on('system', (m) => window.__attackMsgs.push({t: Date.now(), sys: m.text}));
        """)

        # 开刺杀
        page.evaluate("window.__conn.send('castMagic', {magicId:12, targetX:0, targetY:0, targetId:0})")
        time.sleep(0.5)
        print("[开刺杀] longHit =", page.evaluate("() => window.__sceneManager.current.self._longHit"))

        # 抓帧器
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

        # 真实模拟：按住 shift + 鼠标左键（点人物右上方空地，触发方向攻击）
        page.keyboard.down("Shift")
        time.sleep(0.1)
        # 鼠标移到人物右上方（dir=2 向东）
        page.mouse.move(500, 250)
        page.mouse.down()
        time.sleep(0.2)
        page.mouse.up()
        page.keyboard.up("Shift")

        page.wait_for_function("window.__capturing === false", timeout=20000)
        frames = page.evaluate("() => window.__frames")
        for i, f in enumerate(frames):
            if f["sh"] or f["act"] != "stand":
                with open(f"/tmp/fxr_{i}.png", "wb") as fp:
                    fp.write(base64.b64decode(f["data"].split(",", 1)[1]))
                print(f"frame{i}: sh={f['sh']} act={f['act']}")
        msgs = page.evaluate("() => window.__attackMsgs")
        print("[msgs]", msgs)

        browser.close()


if __name__ == "__main__":
    main()
