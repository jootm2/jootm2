# -*- coding: utf-8 -*-
"""Playwright：走到怪物旁 → 测刺杀刀气（空挥）+ 烈火刀气（命中）+ 攻杀。"""
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
    """循环向最近怪物移动；附近无怪则向东南方向巡逻，直到接近怪物 dist<=1。"""
    t0 = time.time()
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
            # 无怪：向东南巡逻
            page.evaluate("window.__conn.send('move', {dir:3})")
            time.sleep(0.58)
            continue
        if pos["dist"] <= 1:
            return pos
        dx = pos["mx"] - pos["x"]
        dy = pos["my"] - pos["y"]
        m = {(1, -1): 1, (1, 0): 2, (1, 1): 3, (0, 1): 4, (-1, 1): 5, (-1, 0): 6, (-1, -1): 7, (0, -1): 0}
        d = m.get((dx and (1 if dx > 0 else -1), dy and (1 if dy > 0 else -1)), 2)
        if dx == 0:
            d = 0 if dy < 0 else 4
        elif dy == 0:
            d = 2 if dx > 0 else 6
        page.evaluate(f"window.__conn.send('move', {{dir:{d}}})")
        time.sleep(0.58)
    return None


def capture(page, n=12, interval=60):
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
        with open(f"/tmp/{prefix}_{i}.png", "wb") as fp:
            fp.write(base64.b64decode(f["data"].split(",", 1)[1]))
    return len(frames)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 800, "height": 600})

        enter(page)

        # 收集 attack 消息
        page.evaluate("""
            window.__attackMsgs = [];
            window.__conn.on('attack', (m) => window.__attackMsgs.push({t: Date.now(), swordHit: m.swordHit, targetId: m.targetId}));
        """)

        pos = walk_to(page)
        if not pos:
            print("[!] 无法接近怪物")
            browser.close()
            return
        print("[ok] 已接近怪物 id=%s dist=%s" % (pos["mid"], pos["dist"]))

        # ---- 1) 刺杀刀气：开刺杀，空挥方向攻击 ----
        page.evaluate("window.__conn.send('castMagic', {magicId:12, targetX:0, targetY:0, targetId:0})")
        time.sleep(0.5)
        capture(page)
        page.evaluate("window.__conn.send('dirAttack', {dir: 2})")
        save(page, "fxsl")
        print("[ok] 刺杀空挥截图完成")

        # ---- 2) 烈火刀气：蓄力后点怪攻击 ----
        page.evaluate("window.__conn.send('castMagic', {magicId:12, targetX:0, targetY:0, targetId:0})")  # 关刺杀
        time.sleep(0.3)
        page.evaluate("window.__conn.send('castMagic', {magicId:26, targetX:0, targetY:0, targetId:0})")
        time.sleep(0.6)
        capture(page)
        page.evaluate(f"window.__conn.send('attack', {{targetId: {pos['mid']}}})")
        save(page, "fxfirehit")
        print("[ok] 烈火命中截图完成")

        # ---- 3) 攻杀：连续点怪攻击（被动随机触发），抓 30 帧 ----
        capture(page, n=30, interval=120)
        for i in range(6):
            page.evaluate(f"window.__conn.send('attack', {{targetId: {pos['mid']}}})")
            time.sleep(0.7)
        save(page, "fxpwhit")
        msgs = page.evaluate("() => window.__attackMsgs.filter(m => m.swordHit).slice(-10)")
        print("[attack swordHit 记录]", msgs)

        browser.close()


if __name__ == "__main__":
    main()
