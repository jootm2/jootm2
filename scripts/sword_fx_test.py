# -*- coding: utf-8 -*-
"""验证战士技能攻击时 attack 消息是否携带 swordHit 字段。"""
import base64, json, os, socket, struct, sys, time

HOST, PORT = "127.0.0.1", 8080


class WS:
    def __init__(self):
        self.s = socket.create_connection((HOST, PORT), timeout=5)
        key = base64.b64encode(os.urandom(16)).decode()
        req = ("GET /ws HTTP/1.1\r\nHost: %s:%d\r\nUpgrade: websocket\r\n"
               "Connection: Upgrade\r\nSec-WebSocket-Key: %s\r\n"
               "Sec-WebSocket-Version: 13\r\n\r\n" % (HOST, PORT, key)).encode()
        self.s.sendall(req)
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = self.s.recv(4096)
            if not chunk:
                raise RuntimeError("握手失败")
            buf += chunk
        head, rest = buf.split(b"\r\n\r\n", 1)
        if b"101" not in head.split(b"\r\n")[0]:
            raise RuntimeError("握手失败: " + head.decode(errors="replace"))
        self.buf = rest

    def _recv(self, n):
        while len(self.buf) < n:
            chunk = self.s.recv(max(4096, n - len(self.buf)))
            if not chunk:
                raise EOFError("连接关闭")
            self.buf += chunk
        out = self.buf[:n]
        self.buf = self.buf[n:]
        return out

    def send(self, obj):
        payload = json.dumps(obj, ensure_ascii=False).encode()
        mask = os.urandom(4)
        n = len(payload)
        h = bytearray([0x81])
        if n < 126:
            h.append(0x80 | n)
        elif n < 65536:
            h.append(0x80 | 126); h += struct.pack("!H", n)
        else:
            h.append(0x80 | 127); h += struct.pack("!Q", n)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.s.sendall(bytes(h) + mask + masked)

    def read_frame(self):
        b1 = self._recv(1)[0]; b2 = self._recv(1)[0]
        opcode = b1 & 0x0F; masked = (b2 >> 7) & 1; ln = b2 & 0x7F
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
        frames = []
        self.s.settimeout(idle)
        try:
            while True:
                op, payload = self.read_frame()
                frames.append(payload.decode(errors="replace"))
                self.s.settimeout(0.3)
                if op == 0x8:
                    break
        except (socket.timeout, EOFError, OSError):
            pass
        return frames


def parse(frames):
    return [json.loads(f) for f in frames if f.strip().startswith("{")]


def main():
    ws = WS()
    def act(obj, wait=0.6):
        ws.send(obj)
        return parse(ws.drain(wait))

    act({"type": "login", "username": "test_warrior", "password": "pass1234"}, 0.5)
    act({"type": "enterGame", "name": "战士测试"}, 0.8)
    enter = act({"type": "noticeOk", "name": "战士测试"}, 0.8)
    eg = [m for m in enter if m.get("type") == "enterGame"]
    if not eg:
        print("[!] 进入游戏失败, 收到:", [m.get('type') for m in enter])
        sys.exit(1)
    player = eg[0].get("player", {})
    monsters = [a for a in eg[0].get("nearby", []) if a.get("type") == "monster"]
    print("[ok] 进入游戏, 附近怪物 %d 个, 玩家pos=(%s,%s)" % (len(monsters), player.get("x"), player.get("y")))

    # 开半月（magicId=25），看返回
    res = act({"type": "castMagic", "magicId": 25, "targetX": 0, "targetY": 0, "targetId": 0}, 0.5)
    print("[..] 开半月返回:", [m.get('type') for m in res])

    if monsters:
        m = min(monsters, key=lambda x: max(abs(x["x"] - player["x"]), abs(x["y"] - player["y"])))
        tid = m["id"]
        print("[..] 攻击怪物 %s id=%s pos=(%s,%s)" % (m.get("name"), tid, m.get("x"), m.get("y")))
        for i in range(2):
            frames = act({"type": "attack", "targetId": tid}, 0.8)
            for a in [f for f in frames if f.get("type") == "attack"]:
                print("  attack: swordHit=%s keys=%s" % (a.get("swordHit"), sorted(a.keys())))
    else:
        frames = act({"type": "dirAttack", "dir": 2}, 0.8)
        for a in [f for f in frames if f.get("type") == "attack"]:
            print("  dirAttack: swordHit=%s keys=%s" % (a.get("swordHit"), sorted(a.keys())))

    act({"type": "logout"}, 0.4)
    ws.s.close()


if __name__ == "__main__":
    main()
