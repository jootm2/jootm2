# -*- coding: utf-8 -*-
"""Playwright：刺杀空挥，抓帧同时记录 _swordHit/_action 时序。"""
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

        # 开刺杀
        page.evaluate("window.__conn.send('castMagic', {magicId:12, targetX:0, targetY:0, targetId:0})")
        time.sleep(0.5)

        # 抓帧器：每 50ms 抓帧 + 记录 self 状态
        page.evaluate("""
            window.__frames = [];
            window.__capturing = true;
            const canvas = document.getElementById('screen');
            let n = 0;
            function cap() {
                if (!window.__capturing || n >= 16) { window.__capturing = false; return; }
                const s = window.__sceneManager.current;
                window.__frames.push({
                    t: Date.now(),
                    data: canvas.toDataURL('image/png'),
                    sh: s.self._swordHit, act: s.self._action, dir: s.self.dir
                });
                n++;
                setTimeout(cap, 50);
            }
            cap();
        """)

        page.evaluate("window.__conn.send('dirAttack', {dir: 2})")

        page.wait_for_function("window.__capturing === false", timeout=20000)
        frames = page.evaluate("() => window.__frames")
        for i, f in enumerate(frames):
            with open(f"/tmp/fxs2_{i}.png", "wb") as fp:
                fp.write(base64.b64decode(f["data"].split(",", 1)[1]))
            print(f"frame{i}: t={f['t']} sh={f['sh']} act={f['act']} dir={f['dir']}")

        browser.close()


if __name__ == "__main__":
    main()
