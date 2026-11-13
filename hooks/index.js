const AUTH_REL =
  '.local/share/CodeBuddyExtension/Data/Public/auth/Tencent-Cloud.coding-copilot.info';
const PANE_ID = 'cbc-to';
const PANE_TITLE = 'Select recipient';
const HOTKEYS = '1234567890abcdefghijklmnopqrstuvwxyz';

const state = {
  open: false,
  targets: [],
};

function pad(text, width) {
  const s = String(text ?? '');
  const len = [...s].length;
  return len >= width ? s : s + ' '.repeat(width - len);
}

function ago(ms) {
  if (!ms) return '从未使用';
  const diff = Date.now() - ms;
  if (diff < 60e3) return '刚刚';
  if (diff < 3600e3) return `${Math.floor(diff / 60e3)} 分钟前`;
  if (diff < 86400e3) return `${Math.floor(diff / 3600e3)} 小时前`;
  return `${Math.floor(diff / 86400e3)} 天前`;
}

function slugOf(dir) {
  return String(dir).replace(/^\//, '').replace(/\//g, '-');
}

function h(type, props, children) {
  return { type, props: props || {}, children: children || [] };
}

async function readAccount($, home) {
  const file = `${home}/${AUTH_REL}`;
  try {
    if (!(await $.fs.exists(file))) return null;
    const data = JSON.parse(await $.fs.read(file));
    return data && data.account ? data.account : null;
  } catch {
    return null;
  }
}

async function collect($) {
  const passwd = await $.fs.read('/etc/passwd');
  const targets = [];
  for (const line of passwd.split('\n')) {
    const parts = line.split(':');
    if (parts.length < 6) continue;
    const [name, , , , , home] = parts;
    if (home !== '/root' && !/^\/home\/[^/]+$/.test(home)) continue;
    if (name === 'nobody') continue;
    try {
      if ((await $.fs.stat(home)).kind !== 'dir') continue;
    } catch {
      continue;
    }
    const account = await readAccount($, home);
    let mtime = 0;
    const hist = `${home}/.codebuddy/history.jsonl`;
    try {
      if (await $.fs.exists(hist)) mtime = (await $.fs.stat(hist)).mtimeMs;
    } catch {
      mtime = 0;
    }
    targets.push({ name, home, account, mtime, pc: false });
  }
  targets.sort((a, b) => b.mtime - a.mtime);
  targets.push({ name: 'pc', home: '', account: { nickname: 'Windows' }, mtime: 0, pc: true });
  return targets;
}

function labelOf(t) {
  const account = t.account?.nickname || (t.pc ? 'Windows' : '未登录');
  return `${pad(t.name, 8)} ${pad(account, 30)} ${t.pc ? '电脑' : ago(t.mtime)}`;
}

function buildTree() {
  const rows = state.targets.map((t, i) => {
    const hotkey = HOTKEYS[i] || '';
    return h(
      'Button',
      {
        key: `cbc-to:${t.name}`,
        label: labelOf(t),
        hotkey,
        plain: true,
      },
      [],
    );
  });
  return h('Box', { flexDirection: 'column', paddingX: 1 }, [
    h('Text', { text: PANE_TITLE, bold: true }, []),
    h('Text', { text: '按前面的字符选择，Esc 退出', dimColor: true }, []),
    ...rows,
  ]);
}

async function openPane($, targets) {
  state.targets = targets;
  state.open = true;
  const opened = await $.ui.open({
    id: PANE_ID,
    title: PANE_TITLE,
    focus: true,
    closeOnEscape: true,
    rows: Math.min(targets.length + 3, 28),
  });
  if (!opened || !opened.isPlaced) {
    state.open = false;
    return false;
  }
  return true;
}

async function send($, target) {
  if (target.pc) {
    return '电脑端还没接上：ssh 能连，但 scp 被电脑的 sshd 拒了。下一步单独做。';
  }
  const home = await $.env.get('HOME');
  const cwd = await $.session.cwd();
  const sessionId = await $.session.id();
  const src = `${home}/.codebuddy/projects/${slugOf(cwd)}/${sessionId}.jsonl`;
  if (!(await $.fs.exists(src))) return `找不到当前会话文件：${src}`;
  const dstDir = `${target.home}/.codebuddy/projects/${slugOf(target.home)}`;
  await $.process.run(['mkdir', '-p', dstDir]);
  const cp = await $.process.run(['cp', '-a', src, `${dstDir}/`]);
  if (cp && cp.exitCode !== 0) {
    return `复制失败：${(cp.stderr || '').trim() || cp.exitCode}`;
  }
  const side = `${home}/.codebuddy/projects/${slugOf(cwd)}/${sessionId}`;
  if (await $.fs.exists(side)) {
    await $.process.run(['cp', '-a', side, `${dstDir}/`]);
  }
  return `已发给 ${target.name}（${target.account?.nickname || '未登录'}）。对方在 ${target.home} 里运行 cbc -r 就能看到。`;
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'to',
        description: '把这个会话发给另一个用户',
        argumentHint: '[用户名]',
      });
    } catch {}
    return next(e);
  });

  on('command.run', { command: 'to' }, async ($, e) => {
    const arg = String(e.args || '').trim();
    const targets = await collect($);
    if (arg) {
      const target = targets.find((t) => t.name === arg);
      if (!target) return { text: `没有这个用户：${arg}` };
      return { text: await send($, target) };
    }
    const ok = await openPane($, targets);
    if (!ok) return { text: '打不开选择面板。' };
    return { text: '选一个接收者：' };
  });

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (!state.open || e.props?.title !== PANE_TITLE) return next(e);
    const beneath = await next(e);
    return { ...beneath, tree: buildTree() };
  });

  on('ui.press', async ($, e, next) => {
    const key = String(e.element || '');
    if (!key.startsWith('cbc-to:')) return next(e);
    const name = key.slice('cbc-to:'.length);
    const target = state.targets.find((t) => t.name === name);
    state.open = false;
    await $.ui.close({ id: PANE_ID });
    if (!target) return next(e);
    const message = await send($, target);
    $.ui.toast(message, { timeoutMs: 12000 });
    return { value: e.element };
  });

  on('ui.close', { id: PANE_ID }, async ($, e, next) => {
    state.open = false;
    return next(e);
  });
}
