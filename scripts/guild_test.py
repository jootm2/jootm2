# -*- coding: utf-8 -*-
"""行会 / 攻城端到端测试（纯 Python 标准库）。"""
import json
import sys
import time
from smoke_test import WS, parse, find_type

HOST = "127.0.0.1"
PORT = 8080


def test_guild():
    ws = WS()
    ts = str(int(time.time() * 1000))[-8:]
    account = "g" + ts
    charname = "g" + ts

    def act(obj, wait=0.6):
        ws.send(obj)
        return parse(ws.drain(wait))

    reg = find_type(act({"type": "register", "username": account, "password": "pass1234"}), "registerResult")
    assert reg and reg[0].get("ok") is True, "注册失败"
    find_type(act({"type": "login", "username": account, "password": "pass1234"}), "loginResult")
    cr = find_type(act({"type": "createCharacter", "name": charname, "sex": 0, "hair": 1, "job": 0}), "createCharacterResult")
    assert cr and cr[0].get("ok") is True, "创建角色失败"
    find_type(act({"type": "enterGame", "name": charname}, 0.8), "enterGame")

    gname = "Guild" + ts

    # 1. 创建行会
    msgs = act({"type": "createGuild", "name": gname})
    sysmsgs = find_type(msgs, "systemMessage")
    assert any("创建了行会" in m.get("text", "") for m in sysmsgs), "创建行会失败: %s" % [m.get('text') for m in sysmsgs]
    print("[ok] 创建行会 ->", [m["text"] for m in sysmsgs])

    # 2. 行会信息
    msgs = act({"type": "guildInfo"})
    sysmsgs = find_type(msgs, "systemMessage")
    assert any(gname in m.get("text", "") for m in sysmsgs), "行会信息失败"
    print("[ok] 行会信息 ->", [m["text"] for m in sysmsgs])

    # 3. 行会聊天
    msgs = act({"type": "guildChat", "text": "hello guild"})
    gc = find_type(msgs, "guildChat")
    assert gc and gc[0].get("text") == "hello guild", "行会聊天失败"
    print("[ok] 行会聊天 ->", gc[0].get("guild"), ":", gc[0].get("text"))

    # 4. 攻城宣战（会长）
    msgs = act({"type": "siege"})
    sysmsgs = find_type(msgs, "systemMessage")
    assert any("攻城" in m.get("text", "") for m in sysmsgs), "攻城宣战失败"
    print("[ok] 攻城宣战 ->", [m["text"] for m in sysmsgs])

    # 5. 退会（会长退会 = 解散）
    msgs = act({"type": "leaveGuild"})
    sysmsgs = find_type(msgs, "systemMessage")
    assert any("退出" in m.get("text", "") for m in sysmsgs), "退会失败"
    print("[ok] 退会 ->", [m["text"] for m in sysmsgs])

    act({"type": "logout"}, 0.5)
    print("\nGUILD TEST PASSED")


if __name__ == "__main__":
    sys.path.insert(0, "scripts")
    test_guild()
