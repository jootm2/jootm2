# -*- coding: utf-8 -*-
"""检查前端地图 highWall 标记（FrImg 0x8000）是否正确加载。"""
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
        time.sleep(1.0)

        # 检查地图 highWall 标记（城堡城墙 241,677 附近 + 村庄围墙 292,615 附近）
        result = page.evaluate("""
            () => {
                const sc = window.__sceneManager.current;
                const map = sc.mapActor.map;
                const out = [];
                // 村庄围墙（BkImg 0x8000，应 highWall=false）
                const wall = map.tiles[292] && map.tiles[292][615];
                out.push({ pos: '(292,615) 村庄围墙', highWall: wall ? wall.highWall : null, canStand: wall ? wall.canStand : null });
                // 城堡城墙（FrImg 0x8000，应 highWall=true）
                const castle = map.tiles[241] && map.tiles[241][677];
                out.push({ pos: '(241,677) 城堡城墙', highWall: castle ? castle.highWall : null, canStand: castle ? castle.canStand : null });
                const castle2 = map.tiles[78] && map.tiles[78][410];
                out.push({ pos: '(78,410) 城堡城墙', highWall: castle2 ? castle2.highWall : null, canStand: castle2 ? castle2.canStand : null });
                return out;
            }
        """)
        print(result)
        browser.close()


if __name__ == "__main__":
    main()
