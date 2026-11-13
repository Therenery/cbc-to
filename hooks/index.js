const AUTH_REL =
  '.local/share/CodeBuddyExtension/Data/Public/auth/Tencent-Cloud.coding-copilot.info';

function slugOf(dir) {
  return String(dir).replace(/^\//, '').replace(/\//g, '-');
}

const WIDE =
  /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/;

function widthOf(text) {
  let w = 0;
  for (const ch of String(text ?? '')) w += WIDE.test(ch) ? 2 : 1;
  return w;
}

function pad(text, width) {
  const s = String(text ?? '');
  const len = widthOf(s);
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

function stamp(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
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
  targets.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  targets.push({ name: 'pc', home: '', account: { nickname: 'Windows' }, mtime: 0, pc: true });
  return targets;
}

async function send($, target) {
  if (target.pc) {
    return '电脑端还没接上：ssh 能连，但 scp 被电脑的 sshd 拒了。下一步单独做。';
  }
  const home = await $.env.get('HOME');
  const cwd = await $.session.cwd();
  const sessionId = await $.session.id();
  const dataRoot = (await $.env.get('CODEBUDDY_CONFIG_DIR')) || `${home}/.codebuddy`;
  const src = `${dataRoot}/projects/${slugOf(cwd)}/${sessionId}.jsonl`;
  if (!(await $.fs.exists(src))) return `找不到当前会话文件：${src}`;
  const dstDir = `${target.home}/.codebuddy/projects/${slugOf(target.home)}`;
  await $.process.run(['mkdir', '-p', dstDir]);
  const cp = await $.process.run(['cp', '-a', src, `${dstDir}/`]);
  if (cp && cp.exitCode !== 0) {
    return `复制失败：${(cp.stderr || '').trim() || cp.exitCode}`;
  }
  const side = `${dataRoot}/projects/${slugOf(cwd)}/${sessionId}`;
  if (await $.fs.exists(side)) {
    await $.process.run(['cp', '-a', side, `${dstDir}/`]);
  }
  return `已发给 ${target.name}（${target.account?.nickname || '未登录'}）。对方在 ${target.home} 里运行 cbc -r 就能看到。`;
}

async function listSessions($, home) {
  const root = `${home}/.codebuddy/projects`;
  let dirs;
  try {
    dirs = await $.fs.list(root);
  } catch {
    return [];
  }
  const out = [];
  for (const d of dirs) {
    if (d.kind !== 'dir') continue;
    const dir = `${root}/${d.name}`;
    let files;
    try {
      files = await $.fs.list(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (f.kind !== 'file' || !f.name.endsWith('.jsonl')) continue;
      out.push({
        id: f.name.replace(/\.jsonl$/, ''),
        path: `${dir}/${f.name}`,
        project: d.name,
        mtime: f.mtimeMs || 0,
      });
    }
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

async function previewOf($, path) {
  try {
    const head = await $.process.run(['head', '-c', '65536', path]);
    if (!head || head.exitCode !== 0) return '';
    for (const line of String(head.stdout || '').split('\n')) {
      if (!line.includes('"role":"user"')) continue;
      try {
        const row = JSON.parse(line);
        const text = (row.content || [])
          .filter((c) => c.type === 'input_text' || c.type === 'text')
          .map((c) => c.text || '')
          .join(' ')
          .trim();
        if (!text || text.startsWith('<')) continue;
        return text.replace(/\s+/g, ' ').slice(0, 42);
      } catch {
        continue;
      }
    }
  } catch {}
  return '';
}

async function copySession($, session) {
  const home = await $.env.get('HOME');
  const cwd = await $.session.cwd();
  const dataRoot = (await $.env.get('CODEBUDDY_CONFIG_DIR')) || `${home}/.codebuddy`;
  const dstDir = `${dataRoot}/projects/${slugOf(cwd)}`;
  await $.process.run(['mkdir', '-p', dstDir]);
  const cp = await $.process.run(['cp', '-a', session.path, `${dstDir}/`]);
  if (cp && cp.exitCode !== 0) {
    return `复制失败：${(cp.stderr || '').trim() || cp.exitCode}`;
  }
  const side = session.path.replace(/\.jsonl$/, '');
  if (await $.fs.exists(side)) {
    await $.process.run(['cp', '-a', side, `${dstDir}/`]);
  }
  return `已拉取 ${session.id.slice(0, 8)}（${stamp(session.mtime)} · ${session.project}）。在 ${cwd} 里运行 cbc -r 就能看到。`;
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'to',
        description: '把这个会话发给另一个用户',
        argumentHint: '[用户名]',
      });
      await $.command.register({
        name: 'resfrom',
        description: '从另一个用户那里拉取会话历史',
        argumentHint: '[用户名] [序号]',
      });
    } catch {}
    return next(e);
  });

  on('prompt.autocomplete', async ($, e, next) => {
    const text = String(e.text || '');
    const token = String(e.token || '');
    let partial;
    if (token === '/to') partial = null;
    else if (/^\/to\s/.test(text) && !/\s/.test(token)) partial = token;
    else return next(e);
    const targets = (await collect($)).filter((t) => !t.pc);
    const list = partial === null ? targets : targets.filter((t) => t.name.startsWith(partial));
    const beneath = await next(e);
    return {
      ...beneath,
      suggestions: list.map((t) => ({
        text: partial === null ? `/to ${t.name}` : t.name,
        label: `${pad(t.name, 8)} ${pad(t.account?.nickname || '未登录', 30)} ${ago(t.mtime)}`,
      })),
    };
  });

  on('command.run', { command: 'to' }, async ($, e) => {
    const arg = String(e.args || '').trim();
    if (!arg) {
      return { text: '用法：/to <用户名>。输入 /to 后按 ↑↓ 选择，Enter 填入，再 Enter 发送。' };
    }
    const targets = await collect($);
    const target = targets.find((t) => t.name === arg);
    if (!target) return { text: `没有这个用户：${arg}` };
    return { text: await send($, target) };
  });

  on('command.run', { command: 'resfrom' }, async ($, e) => {
    const parts = String(e.args || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      const targets = (await collect($)).filter((t) => !t.pc);
      return {
        text: `用法：/resfrom <用户名> [序号]\n用户：${targets.map((t) => t.name).join('  ')}`,
      };
    }
    const name = parts[0];
    const targets = await collect($);
    const target = targets.find((t) => t.name === name);
    if (!target || target.pc) return { text: `没有这个用户：${name}` };

    if (parts.length === 1) {
      const sessions = await listSessions($, target.home);
      if (sessions.length === 0) return { text: `${name} 没有会话记录。` };
      const top = sessions.slice(0, 8);
      await $.store.set(`resfrom:${name}`, top);
      const lines = [];
      for (let i = 0; i < top.length; i++) {
        const s = top[i];
        const pv = await previewOf($, s.path);
        lines.push(`${i + 1}. ${stamp(s.mtime)}  ${s.project}  ${s.id.slice(0, 8)}  ${pv}`);
      }
      return {
        text: `${name} 最近的会话：\n${lines.join('\n')}\n用 /resfrom ${name} <序号> 拉取。`,
      };
    }

    const idx = Number.parseInt(parts[1], 10);
    let sessions = (await $.store.get(`resfrom:${name}`)) || [];
    if (!Array.isArray(sessions) || sessions.length === 0) {
      sessions = (await listSessions($, target.home)).slice(0, 8);
    }
    if (!Number.isInteger(idx) || idx < 1 || idx > sessions.length) {
      return { text: `序号超出范围：${parts[1]}` };
    }
    return { text: await copySession($, sessions[idx - 1]) };
  });
}
