# -*- coding: utf-8 -*-
"""Playwright：验证半月开关/烈火蓄力不再播施法动作。"""
import time
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

        # 监听 spellCast
        page.evaluate("""
            window.__casts = [];
            window.__conn.on('spellCast', (m) => window.__casts.push({t: Date.now(), magicId: m.magicId}));
        """)

        # 开半月
        page.evaluate("window.__conn.send('castMagic', {magicId:25, targetX:0, targetY:0, targetId:0})")
        time.sleep(0.5)
        # 开刺杀
        page.evaluate("window.__conn.send('castMagic', {magicId:12, targetX:0, targetY:0, targetId:0})")
        time.sleep(0.5)
        # 烈火蓄力
        page.evaluate("window.__conn.send('castMagic', {magicId:26, targetX:0, targetY:0, targetId:0})")
        time.sleep(0.5)
        # 对照组：法师技能（火球，应有 spellCast）
        page.evaluate("window.__conn.send('castMagic', {magicId:1, targetX:290, targetY:618, targetId:0})")
        time.sleep(0.5)

        casts = page.evaluate("() => window.__casts")
        print("[spellCast 消息]", casts)
        print("[动作]半月后 action =", page.evaluate("() => window.__sceneManager.current.self._action"))

        browser.close()


if __name__ == "__main__":
    main()
