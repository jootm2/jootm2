# -*- coding: utf-8 -*-
"""Playwright：烈火命中调试（监听 attack/system 消息）。"""
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


def walk_to(page, timeout=40):
    t0 = time.time()
    DIR8 = {(1, -1): 1, (1, 0): 2, (1, 1): 3, (0, 1): 4, (-1, 1): 5, (-1, 0): 6, (-1, -1): 7, (0, -1): 0}
    last = None
    stuck = 0
    while time.time() - t0 < timeout:
        pos = page.evaluate("""() => {
            const s = window.__sceneManager.current;
            const self = s.self;
            let best = null, bd = 1e9;
            for (const e of s.entities.values()) {
                if (e.type === 'monster' && e.hp > 0) {
                    const d = Math.max(Math.abs(e.x - self.x), Math.abs(e.y - self.y));
                    if (d < bd) { bd = d; best = e; }
                }
            }
            return { x: self.x, y: self.y, dist: best ? bd : -1, mid: best ? best.id : 0,
                     mx: best ? best.x : 0, my: best ? best.y : 0 };
        }""")
        if pos["dist"] < 0:
            page.evaluate("window.__conn.send('move', {dir:3})")
            time.sleep(0.58)
            continue
        if pos["dist"] <= 1:
            return pos
        if last == (pos["x"], pos["y"]):
            stuck += 1
        else:
            stuck = 0
        last = (pos["x"], pos["y"])
        if stuck >= 2:
            page.evaluate("window.__conn.send('move', {dir:0})")
            time.sleep(0.58)
            page.evaluate("window.__conn.send('move', {dir:2})")
            time.sleep(0.58)
            stuck = 0
            continue
        dx = 1 if pos["mx"] > pos["x"] else (-1 if pos["mx"] < pos["x"] else 0)
        dy = 1 if pos["my"] > pos["y"] else (-1 if pos["my"] < pos["y"] else 0)
        page.evaluate(f"window.__conn.send('move', {{dir:{DIR8.get((dx, dy), 2)}}})")
        time.sleep(0.58)
    return None


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 800, "height": 600})

        enter(page)

        # 消息监听
        page.evaluate("""
            window.__msgs = [];
            window.__conn.on('attack', (m) => window.__msgs.push({t: Date.now(), type:'attack', swordHit: m.swordHit, targetId: m.targetId, damage: m.damage}));
            window.__conn.on('system', (m) => window.__msgs.push({t: Date.now(), type:'system', text: m.text}));
            window.__conn.on('death', (m) => window.__msgs.push({t: Date.now(), type:'death', id: m.id}));
        """)

        pos = walk_to(page)
        if not pos:
            print("[!] 无法接近怪物")
            print(page.evaluate("() => window.__msgs"))
            browser.close()
            return
        print("[ok] 已接近怪物 id=%s dist=%s" % (pos["mid"], pos["dist"]))

        # 烈火蓄力
        page.evaluate("window.__conn.send('castMagic', {magicId:26, targetX:0, targetY:0, targetId:0})")
        time.sleep(0.6)

        # 抓帧 + 攻击（原子执行）
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
                setTimeout(cap, 45);
            }
            cap();
            window.__conn.send('attack', {targetId: %d});
        """ % pos["mid"])

        page.wait_for_function("window.__capturing === false", timeout=20000)
        frames = page.evaluate("() => window.__frames")
        for i, f in enumerate(frames):
            with open(f"/tmp/fxf4_{i}.png", "wb") as fp:
                fp.write(base64.b64decode(f["data"].split(",", 1)[1]))
            print(f"frame{i}: sh={f['sh']} act={f['act']}")
        msgs = page.evaluate("() => window.__msgs.slice(-12)")
        print("[msgs]", msgs)

        browser.close()


if __name__ == "__main__":
    main()
