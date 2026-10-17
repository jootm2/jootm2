# -*- coding: utf-8 -*-
"""道士技能验收：施毒(红/绿毒)、隐身、召唤骷髅。"""
import time
from playwright.sync_api import sync_playwright

URL = "http://localhost:8080/"


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 800, "height": 600})
        page.goto(URL, wait_until="load")
        page.wait_for_function("window.__conn && window.__conn.connected === true", timeout=15000)
        page.evaluate("window.__conn.send('login', {username:'test_taoist', password:'1234'})")
        page.wait_for_function("window.__sceneManager.current && window.__sceneManager.current.constructor.name === 'SelectCharScene'", timeout=8000)
        page.evaluate("window.__conn.send('enterGame', {name:'道士测试'})")
        page.wait_for_function("window.__sceneManager.current && window.__sceneManager.current.constructor.name === 'NoticeScene'", timeout=8000)
        page.evaluate("window.__conn.send('noticeOk', {name:'道士测试'})")
        page.wait_for_function("window.__sceneManager.current && window.__sceneManager.current.constructor.name === 'PlayScene'", timeout=8000)
        time.sleep(1.5)

        def sample():
            return page.evaluate("""
                () => {
                    const sc = window.__sceneManager.current;
                    const out = { self: { hidden: !!sc.self._hidden, poison: !!sc.self._poison, poisonArmor: !!sc.self._poisonArmor, x: sc.self.x, y: sc.self.y } };
                    for (const e of sc.entities.values()) {
                        if (e.type === 'monster') out[e.id] = { name: e.name, hp: e.hp, poison: !!e._poison, poisonArmor: !!e._poisonArmor, x: e.x, y: e.y };
                    }
                    return out;
                }
            """)

        # 找一只怪（移动探索：向四个方向各走几步）
        tid = None
        for _ in range(8):
            s = sample()
            for k, v in s.items():
                if isinstance(v, dict) and v.get('name'):
                    tid = int(k)
                    break
            if tid:
                break
            page.evaluate("window.__conn.send('move', {dir: 2})")  # 向右走找怪
            time.sleep(0.3)
        if not tid:
            print("[!] 找不到怪，只测隐身/召唤")
        else:
            print("[..] 找到怪 id=", tid, sample()[str(tid)])

            # 施红毒
            page.evaluate(f"window.__conn.send('castMagic', {{magicId:6, targetId:{tid}, targetX:0, targetY:0}})")
            time.sleep(0.8)
            s = sample()[str(tid)]
            print("[红毒后] 怪:", s, "→ poison 应为 True")

            hp_before = s['hp']
            time.sleep(3.0)
            s2 = sample()[str(tid)]
            print("[3秒后] 怪 hp:", s2['hp'], "(之前", hp_before, ") 红毒掉血应下降")

        # 隐身
        page.evaluate("window.__conn.send('castMagic', {magicId:18, targetX:0, targetY:0, targetId:0})")
        time.sleep(0.6)
        print("[隐身后] self.hidden =", sample()['self']['hidden'])

        # 召唤骷髅
        page.evaluate("window.__conn.send('castMagic', {magicId:17, targetX:0, targetY:0, targetId:0})")
        time.sleep(1.0)
        sk = page.evaluate("""
            () => {
                const sc = window.__sceneManager.current;
                for (const e of sc.entities.values()) {
                    if (e.type === 'monster' && (e.name === '骷髅' || e.name === '神兽')) return { name: e.name, id: e.id, x: e.x, y: e.y, hp: e.hp };
                }
                return null;
            }
        """)
        print("[召唤骷髅]", sk)

        # 用召唤的骷髅作为施毒目标，验证红毒掉血机制（骷髅是宠物，但施毒逻辑不区分）
        if sk:
            page.evaluate(f"window.__conn.send('castMagic', {{magicId:6, targetId:{sk['id']}, targetX:0, targetY:0}})")
            time.sleep(0.8)
            s = sample()[str(sk['id'])]
            print("[对骷髅施红毒] 骷髅:", s, "→ poison 应为 True")
            hp_before = s['hp']
            time.sleep(3.0)
            s2 = sample()[str(sk['id'])]
            print("[3秒后] 骷髅 hp:", s2['hp'], "(之前", hp_before, ") 红毒掉血应下降")

        browser.close()


if __name__ == "__main__":
    main()
