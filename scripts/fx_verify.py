# -*- coding: utf-8 -*-
"""Playwright：验证刺杀默认生效（不进游戏不开开关，空挥就有刺杀刀气）。"""
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

        # 检查进游戏后 longHit 是否已默认同步
        st = page.evaluate("() => ({ _longHit: window.__sceneManager.current.self._longHit, _wideHit: window.__sceneManager.current.self._wideHit })")
        print("[进游戏后] _longHit =", st["_longHit"], "| _wideHit =", st["_wideHit"])

        # 技能列表里刺杀(12)是否被标记为被动（不可设置快捷键）
        skills = page.evaluate("() => window.__sceneManager.current.self.skills")
        print("[技能列表] 刺杀(12) key =", (skills.get("12") or {}).get("key"), "| 半月(25) key =", (skills.get("25") or {}).get("key"))

        # 不开任何开关，直接空挥，看 swordHit
        page.evaluate("""
            window.__attackMsgs = [];
            window.__conn.on('attack', (m) => window.__attackMsgs.push({swordHit: m.swordHit, targetId: m.targetId}));
            window.__frames = [];
            window.__capturing = true;
            const canvas = document.getElementById('screen');
            let n = 0;
            function cap() {
                if (!window.__capturing || n >= 12) { window.__capturing = false; return; }
                const s = window.__sceneManager.current;
                window.__frames.push({ t: Date.now(), data: canvas.toDataURL('image/png'), sh: s.self._swordHit, act: s.self._action });
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
        for i, f in enumerate(frames):
            if f["sh"]:
                with open(f"/tmp/fxv_{i}.png", "wb") as fp:
                    fp.write(base64.b64decode(f["data"].split(",", 1)[1]))
        print("[空挥帧] swordHit 变化:", [(i, f["sh"]) for i, f in enumerate(frames) if f["sh"]])
        print("[attack 消息]", page.evaluate("() => window.__attackMsgs"))

        browser.close()


if __name__ == "__main__":
    main()
