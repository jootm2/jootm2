#!/usr/bin/env python3
"""把 gamedata/mud2/DB/*.DB（Paradox 二进制）导出为 CSV（UTF-8，带表头）。

对应 Java 端 ParadoxDb.java 的解析逻辑；字段顺序 = Paradox 文件实际顺序，
与 Database.mapStdItem/mapMonster/mapMagic 的 r[] 索引一致。
运行一次即可：python3 scripts/paradox_to_csv.py
"""
import struct
import csv
import os

DB_DIR = os.path.join(os.path.dirname(__file__), '..', 'gamedata', 'mud2', 'DB')

STD_HEADER = ['Idx', 'Name', 'StdMode', 'Shape', 'Weight', 'AniCount', 'SpecialPwr',
              'ItemDesc', 'Looks', 'DuraMax', 'AcMin', 'AcMax', 'MacMin', 'MacMax',
              'DcMin', 'DcMax', 'McMin', 'McMax', 'ScMin', 'ScMax', 'Need', 'NeedLevel',
              'Price', 'Stock']

MON_HEADER = ['Name', 'Race', 'RaceImg', 'Appr', 'Level', 'Undead', 'CoolEye', 'Exp',
              'HP', 'MP', 'AC', 'MAC', 'DC', 'DCMax', 'MC', 'SC', 'Speed', 'Hit',
              'WalkSpeed', 'WalkStep', 'WalkWait', 'AttackSpeed']

MAG_HEADER = ['MagId', 'MagName', 'EffectType', 'Effect', 'Spell', 'Power', 'MaxPower',
              'DefSpell', 'DefPower', 'DefMaxPower', 'Job', 'NeedL1', 'L1Train',
              'NeedL2', 'L2Train', 'NeedL3', 'L3Train', 'Delay', 'Descr']


def read_paradox(path):
    with open(path, 'rb') as f:
        data = f.read()
    record_size = struct.unpack_from('<H', data, 0)[0]
    block_size = struct.unpack_from('<H', data, 2)[0]
    num_records = struct.unpack_from('<I', data, 6)[0]

    off = 0x78
    fields = []
    s = 0
    while s < record_size:
        t = data[off]
        sz = data[off + 1]
        fields.append((t, sz))
        s += sz
        off += 2

    per_block = (block_size - 6) // record_size
    records = []
    remaining = num_records
    block = 1
    while remaining > 0:
        base = block * block_size
        if base + record_size > len(data):
            break
        n = min(remaining, per_block)
        rec_off = base + 6
        for r in range(n):
            p = rec_off + r * record_size
            rec = []
            for t, sz in fields:
                rec.append(decode(data, p, t, sz))
                p += sz
            records.append(rec)
        remaining -= n
        block += 1
    return records


def decode(data, off, t, sz):
    if t == 0x01:  # alpha（GBK，NUL 补齐）
        end = off
        while end < off + sz and data[end] != 0:
            end += 1
        return data[off:end].decode('gbk', errors='replace')
    if t == 0x03:  # short（大端 + 高字节标志位）
        return ((data[off] & 0x7F) << 8) | (data[off + 1] & 0xFF)
    if t == 0x04:  # long int（大端 + 高字节标志位）
        return ((data[off] & 0x7F) << 24) | (data[off + 1] << 16) | \
               (data[off + 2] << 8) | data[off + 3]
    return 0


def write_csv(path, header, records):
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(header)
        for r in records:
            w.writerow(r)
    print(f'[csv] {path}  ({len(records)} 行)')


def main():
    os.makedirs(DB_DIR, exist_ok=True)
    tasks = [
        ('StdItems.DB', 'StdItems.csv', STD_HEADER),
        ('Monster.DB', 'Monster.csv', MON_HEADER),
        ('Magic.DB', 'Magic.csv', MAG_HEADER),
    ]
    for src, dst, header in tasks:
        src_path = os.path.join(DB_DIR, src)
        if not os.path.exists(src_path):
            print(f'[csv] 跳过（不存在）{src_path}')
            continue
        write_csv(os.path.join(DB_DIR, dst), header, read_paradox(src_path))


if __name__ == '__main__':
    main()
