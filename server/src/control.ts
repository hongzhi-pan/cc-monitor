import { execFile } from 'node:child_process';

export type ClaudeRunner = (args: string[]) => Promise<{ code: number; stdout: string }>;

/** 以参数数组方式调用 claude 命令行，不经过 shell 拼接 */
export const defaultRunner: ClaudeRunner = (args) =>
  new Promise((resolve) => {
    execFile('cmd.exe', ['/c', 'claude', ...args], { windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0;
      resolve({ code, stdout: `${stdout ?? ''}${stderr ?? ''}` });
    });
  });

export async function stopSession(jobId: string, run: ClaudeRunner = defaultRunner): Promise<{ ok: boolean; output: string }> {
  if (!/^[0-9a-f]{8}$/.test(jobId)) return { ok: false, output: '无效的会话 id' };
  const r = await run(['stop', jobId]);
  return { ok: r.code === 0, output: r.stdout.trim() };
}

export interface ConvertDeps {
  /** 结束普通窗口里的 Claude Code 进程（连同它的子进程） */
  kill(pid: number): Promise<boolean>;
  /** 在指定目录运行 claude 命令行 */
  run(args: string[], cwd: string): Promise<{ code: number; stdout: string }>;
  sleep?(ms: number): Promise<void>;
}

/** 直接执行 claude.exe，参数不经过 shell，会话 id 和目录不会被当成命令解析 */
export function makeConvertDeps(claudeExe: string): ConvertDeps {
  return {
    kill: (pid) =>
      new Promise((resolve) => {
        execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, (err) => resolve(!err));
      }),
    run: (args, cwd) =>
      new Promise((resolve) => {
        execFile(claudeExe, args, { cwd, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
          const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0;
          resolve({ code, stdout: `${stdout ?? ''}${stderr ?? ''}` });
        });
      }),
  };
}

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 把普通窗口里的会话转成后台会话：结束原进程，再用 claude --bg --resume 把同一段对话在后台跑起来。
 * 原进程结束后才能 resume，所以这一步不可撤销；resume 失败时对话记录仍在，可以手动再跑一次。
 */
export async function convertToBackground(
  info: { pid: number; sessionId: string; cwd: string },
  deps: ConvertDeps,
): Promise<{ ok: boolean; output: string; jobId?: string }> {
  if (!SESSION_ID.test(info.sessionId)) return { ok: false, output: '无效的会话 id' };
  if (!Number.isInteger(info.pid) || info.pid <= 0 || !info.cwd) return { ok: false, output: '会话信息不完整，无法转换' };
  if (!(await deps.kill(info.pid))) return { ok: false, output: '没能结束电脑上那个窗口里的 Claude Code，会话保持原样' };
  await (deps.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms))))(800); // 等进程退干净、转录文件落盘
  const r = await deps.run(['--bg', '--resume', info.sessionId], info.cwd);
  const output = r.stdout.trim();
  if (r.code !== 0) {
    return { ok: false, output: `原窗口已结束，但后台启动失败：${output || `退出码 ${r.code}`}。对话记录还在，可在电脑上运行 claude --bg --resume ${info.sessionId}` };
  }
  return { ok: true, output, jobId: output.match(/\b[0-9a-f]{8}\b/)?.[0] };
}
