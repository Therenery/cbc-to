#!/usr/bin/env python3
"""给 CodeBuddy Code 的终端面板补上上下键导航（可逆）。

cbc 2.184.0 的 Mod 面板只认 Tab / 左右键。这个脚本把 upArrow / downArrow
加进面板导航判断，打完补丁后 /to 面板可以直接用上下键。

    python3 scripts/patch-tui-updown.py
    python3 scripts/patch-tui-updown.py --revert

cbc 升级会覆盖 dist，需要重新打。
"""
import argparse
import shutil
import sys
from pathlib import Path

OLD = (
    'if(e_.length>0&&(ec.tab||ec.leftArrow||ec.rightArrow))'
    '{let eA=Math.max(0,e_.indexOf(ek??"")),el=ec.leftArrow||ec.tab&&ec.shift?-1:1;'
)
NEW = (
    'if(e_.length>0&&(ec.tab||ec.leftArrow||ec.rightArrow||ec.upArrow||ec.downArrow))'
    '{let eA=Math.max(0,e_.indexOf(ek??"")),el=ec.upArrow||ec.leftArrow||ec.tab&&ec.shift?-1:1;'
)

CANDIDATES = [
    '/usr/lib/node_modules/@tencent-ai/codebuddy-code/dist/codebuddy.js',
    '/usr/local/lib/node_modules/@tencent-ai/codebuddy-code/dist/codebuddy.js',
    '/data/data/com.termux/files/usr/lib/node_modules/@tencent-ai/codebuddy-code/dist/codebuddy.js',
    str(Path.home() / '.npm-global/lib/node_modules/@tencent-ai/codebuddy-code/dist/codebuddy.js'),
]


def find_target(explicit):
    if explicit:
        p = Path(explicit)
        return p if p.is_file() else None
    for c in CANDIDATES:
        if Path(c).is_file():
            return Path(c)
    return None


def main():
    ap = argparse.ArgumentParser(description='给 cbc 终端面板加上下键')
    ap.add_argument('--file', help='codebuddy.js 路径')
    ap.add_argument('--revert', action='store_true', help='还原补丁')
    args = ap.parse_args()

    target = find_target(args.file)
    if not target:
        print('找不到 codebuddy.js，用 --file 指定', file=sys.stderr)
        return 1

    backup = target.with_name(target.name + '.bak-cbc-to')
    text = target.read_text(errors='ignore')

    if args.revert:
        if not backup.is_file():
            print('没有备份，无法还原：' + str(backup), file=sys.stderr)
            return 1
        shutil.copy2(backup, target)
        print('已还原：' + str(target))
        return 0

    if text.count(NEW) == 1:
        print('已经打过补丁：' + str(target))
        return 0
    if text.count(OLD) != 1:
        print('没找到预期的代码段，cbc 版本可能变了：' + str(target), file=sys.stderr)
        return 1

    if not backup.is_file():
        shutil.copy2(target, backup)
        print('备份：' + str(backup))

    target.write_text(text.replace(OLD, NEW))
    print('已打补丁：' + str(target))
    return 0


if __name__ == '__main__':
    sys.exit(main())
