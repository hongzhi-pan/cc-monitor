#!/usr/bin/env node
// ccm：在任意目录接入 cc-monitor 管着的后台会话。
//   ccm            接入当前目录最新的后台会话
//   ccm <短id或会话名>  接入指定的会话
// 安装：在 cc-monitor 目录运行一次 npm link。
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let tsxCli;
try {
  tsxCli = require.resolve('tsx/cli');
} catch {
  console.error('找不到依赖，请先在 cc-monitor 目录运行 npm install');
  process.exit(1);
}
const script = fileURLToPath(new URL('../cli/src/attach.ts', import.meta.url));

// attach 脚本按 INIT_CWD 判断"当前目录"，这里明确告诉它命令是在哪里敲的
const child = spawn(process.execPath, [tsxCli, script, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, INIT_CWD: process.cwd() },
});
child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (e) => {
  console.error(`启动失败：${e.message}`);
  process.exit(1);
});
