# cbc-to

两个 CodeBuddy Code 命令，用来在本机多个用户之间转交会话：

- `/to` — 把当前会话发给另一个用户，用对方的账号接着聊
- `/resfrom` — 从另一个用户那里拉取历史会话，用当前账号接着聊

## /to

输入 `/to`，输入框下面会弹出本机所有装过 cbc 的用户，按用户名 A-Z 排序，带登录账号：

```
/to
  /to                       把这个会话发给另一个用户 (arguments: [用户名])
  root    therenfoster@gmail.com
  u1      a18764007770@163.com
  u2      therenery2007@gmail.com
  ...
```

↑↓ 选择，Enter 填入，再 Enter 发送。也可以直接 `/to u8`。

发送时只复制会话文件到对方目录，不碰登录状态，所以每个用户还是自己的账号、自己的额度。对方 `cd ~ && cbc -r` 就能看到这个会话。

## /resfrom

```bash
/resfrom u3          # 列出 u3 最近的 8 个会话
/resfrom u3 2        # 把第 2 个拉到当前用户
```

拉取后在自己家目录运行 `cbc -r` 就能接着聊。

## 安装

```bash
cbc plugin add /path/to/cbc-to
```

临时加载（不改配置）：

```bash
cbc --plugin-dir /path/to/cbc-to
```

## 为什么不会串号

cbc 的登录状态存在：

```
~/.local/share/CodeBuddyExtension/Data/Public/auth/Tencent-Cloud.coding-copilot.info
```

会话记录存在：

```
~/.codebuddy/projects/<工作目录>/<会话id>.jsonl
```

两者是分开的。插件只复制会话文件，不碰登录状态。

## 限制

- 对方要在自己家目录里运行 `cbc -r`。cbc 的恢复列表按当前工作目录找会话，在别的目录看不到
- 复制的是发送/拉取那一刻的快照，不会同步后续消息
- `/resfrom` 要读别的用户的家目录，普通 Linux 权限下会失败；这台机器是 proot，所以能读
- 电脑端（Windows）还没接上：ssh 能连，scp 被电脑的 sshd 拒了

## 环境

- CodeBuddy Code 2.184.0 实测
- 依赖 Mods（函数钩子）机制，`/to` 的候选列表走 `prompt.autocomplete`

## License

MIT
