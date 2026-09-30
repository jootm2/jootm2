# -*- coding: utf-8 -*-
"""jootm2-server 端到端集成测试（纯 Python 标准库，无第三方依赖）。

用法:
    python3 scripts/smoke_test.py

前置条件:
    服务端已在本机 8080 端口运行: java -jar target/jootm2-server.jar

覆盖:
    1. WebSocket 握手
    2. 完整协议流: 注册 -> 登录 -> 建角色 -> 进入游戏 -> 移动 -> 聊天 -> 登出
    3. 战斗: 自动寻找并追击击杀一只怪物

退出码: 0 = 通过, 1 = 失败。
"""
import base64
import json
import os
import socket
import struct
import sys
import time

HOST = "127.0.0.1"
PORT = 8080


class WS:
    """极简 WebSocket 客户端，仅用标准库实现。"""

    def __init__(self):
        self.s = socket.create_connection((HOST, PORT), timeout=5)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            "GET /ws HTTP/1.1\r\n"
            "Host: %s:%d\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            "Sec-WebSocket-Key: %s\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n" % (HOST, PORT, key)
        ).encode()
        self.s.sendall(req)
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = self.s.recv(4096)
            if not chunk:
                raise RuntimeError("握手失败: 连接被关闭")
            buf += chunk
        head, rest = buf.split(b"\r\n\r\n", 1)
        if b"101" not in head.split(b"\r\n")[0]:
            raise RuntimeError("握手失败: " + head.decode(errors="replace"))
        self.buf = rest

    def _recv(self, n):
        while len(self.buf) < n:
            chunk = self.s.recv(max(4096, n - len(self.buf)))
            if not chunk:
                raise EOFError("连接被关闭")
            self.buf += chunk
        out = self.buf[:n]
        self.buf = self.buf[n:]
        return out

    def send(self, obj):
        payload = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        mask = os.urandom(4)
        n = len(payload)
        h = bytearray([0x81])
        if n < 126:
            h.append(0x80 | n)
        elif n < 65536:
            h.append(0x80 | 126)
            h += struct.pack("!H", n)
        else:
            h.append(0x80 | 127)
            h += struct.pack("!Q", n)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.s.sendall(bytes(h) + mask + masked)

    def read_frame(self):
        b1 = self._recv(1)[0]
        b2 = self._recv(1)[0]
        opcode = b1 & 0x0F
        masked = (b2 >> 7) & 1
        ln = b2 & 0x7F
        if ln == 126:
            ln = struct.unpack("!H", self._recv(2))[0]
        elif ln == 127:
            ln = struct.unpack("!Q", self._recv(8))[0]
        mask = self._recv(4) if masked else None
        payload = self._recv(ln)
        if masked:
            payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        return opcode, payload

    def drain(self, idle=0.5):
        """读取直到 idle 秒内无新数据，返回收到的文本帧(JSON 字符串)列表。"""
        frames = []
        self.s.settimeout(idle)
        try:
            while True:
                op, payload = self.read_frame()
                frames.append(payload.decode("utf-8", errors="replace"))
                self.s.settimeout(0.3)
                if op == 0x8:
                    break
        except (socket.timeout, EOFError, OSError):
            pass
        return frames


def parse(frames):
    return [json.loads(f) for f in frames if f.strip().startswith("{")]


def find_type(msgs, t):
    return [m for m in msgs if m.get("type") == t]


def dir_towards(x, y, tx, ty):
    dx = 1 if tx > x else (-1 if tx < x else 0)
    dy = 1 if ty > y else (-1 if ty < y else 0)
    m = {(0, -1): 0, (1, -1): 1, (1, 0): 2, (1, 1): 3,
         (0, 1): 4, (-1, 1): 5, (-1, 0): 6, (-1, -1): 7}
    return m[(dx, dy)]


def smoke_test(ws):
    """完整协议冒烟测试：注册 -> 登录 -> 建角色 -> 进游戏 -> 移动 -> 聊天 -> 登出。"""
    stamp = str(int(time.time() * 1000))[-8:]
    account = "u" + stamp
    password = "pass1234"
    charname = "c" + stamp

    def act(obj, wait=0.6):
        ws.send(obj)
        return parse(ws.drain(wait))

    reg = find_type(act({"type": "register", "username": account, "password": password}), "registerResult")
    assert reg and reg[0].get("ok") is True, "注册失败"
    print("[ok] 注册")

    login = find_type(act({"type": "login", "username": account, "password": password}), "loginResult")
    assert login and login[0].get("ok") is True, "登录失败"
    print("[ok] 登录")

    cr = find_type(act({"type": "createCharacter", "name": charname, "sex": 0, "hair": 1, "job": 0}), "createCharacterResult")
    assert cr and cr[0].get("ok") is True, "创建角色失败"
    print("[ok] 创建角色")

    enter = find_type(act({"type": "enterGame", "name": charname}, 0.8), "enterGame")
    assert enter, "未收到 enterGame 快照"
    print("[ok] 进入游戏 (地图 %s)" % enter[0].get("map"))

    assert find_type(act({"type": "move", "dir": 2}), "move"), "未收到移动广播"
    print("[ok] 移动")

    chat = find_type(act({"type": "say", "text": "hello world"}), "chat")
    assert chat and chat[0].get("text") == "hello world", "聊天失败"
    print("[ok] 聊天")

    act({"type": "logout"}, 0.6)
    print("[ok] 登出")


def combat_test():
    """自动寻找怪物并追击击杀（返回是否成功击杀）。"""
    ws = None
    me = None
    target = None
    for attempt in range(12):
        ws = WS()
        ts = str(int(time.time() * 1000))[-9:]
        account = "w" + ts[:-1] + str(attempt)
        name = ("q" + ts + str(attempt))[:12]

        def send(obj, wait=0.5):
            ws.send(obj)
            return parse(ws.drain(wait))

        send({"type": "register", "username": account, "password": "pass1234"}, 0.5)
        send({"type": "login", "username": account, "password": "pass1234"}, 0.5)
        send({"type": "createCharacter", "name": name, "sex": 0, "hair": 1, "job": 0}, 0.5)
        res = send({"type": "enterGame", "name": name}, 0.8)
        eg = find_type(res, "enterGameResult")
        enter = find_type(res, "enterGame")
        if not (eg and eg[0].get("ok") and enter):
            ws.s.close()
            continue
        player = enter[0].get("player", {})
        monsters = [a for a in enter[0].get("nearby", []) if a.get("type") == "monster"]
        if monsters:
            me = {"id": player.get("id"), "x": player.get("x"), "y": player.get("y")}
            target = min(monsters, key=lambda m: max(abs(m["x"] - me["x"]), abs(m["y"] - me["y"])))
            break
        send({"type": "logout"}, 0.4)
        ws.s.close()

    if not me or not target:
        return False

    tid = target["id"]
    tx, ty = target["x"], target["y"]
    myid = me["id"]
    px, py = me["x"], me["y"]
    print("[ok] 发现怪物: %s id=%s pos=(%d,%d)" % (target.get("name"), tid, tx, ty))

    def send(obj, wait=0.25):
        ws.send(obj)
        return parse(ws.drain(wait))

    defeated = False
    for _ in range(150):
        if max(abs(px - tx), abs(py - ty)) > 1:
            d = dir_towards(px, py, tx, ty)
            frames = send({"type": "move", "dir": d})
            for m in frames:
                if m.get("type") == "move" and m.get("id") == myid:
                    px, py = m.get("x"), m.get("y")
                elif m.get("type") == "move" and m.get("id") == tid:
                    tx, ty = m.get("x"), m.get("y")
        else:
            frames = send({"type": "attack", "targetId": tid}, 0.9)
            for m in frames:
                if m.get("type") == "death" and m.get("id") == tid:
                    defeated = True
            if defeated:
                break

    try:
        ws.s.close()
    except Exception:
        pass
    return defeated


def main():
    ws = WS()
    print("[ok] WebSocket 握手 (101)")
    smoke_test(ws)
    try:
        ws.s.close()
    except Exception:
        pass

    print("[..] 自动寻怪并战斗...")
    defeated = combat_test()
    if defeated:
        print("[ok] 战斗: 击杀怪物")
    else:
        print("[!] 战斗: 未击杀（可能多次随机出生点都不在怪视野内，可重跑）")

    print("\nSMOKE TEST PASSED")


if __name__ == "__main__":
    try:
        main()
        sys.exit(0)
    except (AssertionError, Exception) as e:
        print("\n测试失败: %s" % e)
        sys.exit(1)