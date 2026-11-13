# cbc-to

给 CodeBuddy Code 的 `/to` 命令：把当前会话转给本机另一个用户，用对方的账号接着聊。

## 做什么

- 输入 `/to`，弹出一个列表，列出本机所有装过 cbc 的用户，按最近使用排序，显示各自登录的账号
- 按每行前面的字符选择，当前会话的记录文件会复制到对方目录
- 对方 `cd ~ && cbc -r` 就能看到这个会话，接着聊，消耗对方账号的额度
- 也可以直接 `/to u8` 跳过面板

```
 Select recipient
 按前面的字符选择，Esc 退出
 1: u2       therenery2007@gmail.com    8 分钟前
 2: u7       a18764007770@163.com       14 分钟前
 3: u4       a18764007770@163.com       28 分钟前
 ...
 0: ubuntu   未登录                      从未使用
 a: pc       Windows                    电脑
```

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

两者是分开的。这个插件只复制会话文件，不碰登录状态，所以每个用户还是自己的账号、自己的额度。

## 限制

- 对方要在自己家目录里运行 `cbc -r`。cbc 的恢复列表按当前工作目录找会话，在别的目录看不到
- 复制的是发送那一刻的快照，你这边继续聊不会同步过去
- 电脑端（Windows）还没接上：ssh 能连，scp 被电脑的 sshd 拒了
- 面板用数字/字母键选择。内嵌面板里方向键会被面板滚动吃掉，`/model` 那种全屏面板才能用方向键

## 环境

- CodeBuddy Code 2.183.0 实测
- 依赖 Mods（函数钩子）机制

## License

MIT
