import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { EventEmitter } from 'node:events';
import express from 'express';
import { authMiddleware } from './auth.js';
import { hooksRouter } from './hooks.js';
import type { RegistryWatcher } from './registry.js';
import type { AttachManager } from './attach.js';
import type { TranscriptHub } from './ws.js';
import { stopSession, convertToBackground, defaultRunner, type ClaudeRunner, type ConvertDeps } from './control.js';

export interface AppDeps {
  token: string;
  registry: RegistryWatcher;
  attach: AttachManager;
  transcripts: TranscriptHub;
  hookBus: EventEmitter;
  stopRunner?: ClaudeRunner;
  convert?: ConvertDeps;
  /** 转换后等新会话出现在注册表里：每隔多久查一次、最多查几次 */
  convertPollMs?: number;
  convertPollTimes?: number;
  webDist?: string;
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.use(hooksRouter(deps.hookBus));
  app.use(authMiddleware(deps.token));

  app.get('/api/sessions', async (_req, res) => {
    res.json(await deps.registry.refresh());
  });

  app.get('/api/sessions/:sid/transcript', async (req, res) => {
    const info = deps.registry.current().find((s) => s.sessionId === req.params.sid);
    if (!info) {
      res.status(404).json({ error: '会话不存在' });
      return;
    }
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 200));
    res.json(await deps.transcripts.history(info, limit));
  });

  // 停止后台会话：相当于在电脑上运行 claude stop <短id>，对话记录保留
  app.post('/api/sessions/:sid/stop', async (req, res) => {
    const info = deps.registry.current().find((s) => s.sessionId === req.params.sid);
    if (!info) {
      res.status(404).json({ ok: false, output: '会话不存在' });
      return;
    }
    if (!info.attachable || !info.jobId) {
      res.status(400).json({ ok: false, output: '这个会话不是用 claude --bg 启动的，只能在它自己的终端里关闭' });
      return;
    }
    const session = deps.attach.peek(info.jobId);
    session?.expectExit('会话已停止');
    const r = await stopSession(info.jobId, deps.stopRunner ?? defaultRunner);
    if (!r.ok) session?.expectExit(null);
    void deps.registry.refresh();
    res.status(r.ok ? 200 : 502).json(r);
  });

  // 把普通窗口里的会话转成后台会话：结束电脑上那个窗口里的进程，再在后台把同一段对话跑起来
  app.post('/api/sessions/:sid/convert', async (req, res) => {
    const info = deps.registry.current().find((s) => s.sessionId === req.params.sid);
    if (!info) {
      res.status(404).json({ ok: false, output: '会话不存在' });
      return;
    }
    if (info.attachable) {
      res.status(400).json({ ok: false, output: '这个会话已经是后台会话' });
      return;
    }
    if (!deps.convert) {
      res.status(501).json({ ok: false, output: '监测器没有配置转换功能' });
      return;
    }
    const r = await convertToBackground({ pid: info.pid, sessionId: info.sessionId, cwd: info.cwd }, deps.convert);
    if (!r.ok) {
      void deps.registry.refresh();
      res.status(502).json(r);
      return;
    }
    // 新会话通常沿用原来的会话 id，但不依赖这一点：按短 id、会话 id、目录依次找
    const sameDir = (cwd: string) => cwd.replace(/\\/g, '/').toLowerCase() === info.cwd.replace(/\\/g, '/').toLowerCase();
    let found: string | undefined;
    for (let i = 0; i < (deps.convertPollTimes ?? 20) && !found; i++) {
      const bg = (await deps.registry.refresh()).filter((s) => s.attachable);
      found = (bg.find((s) => s.jobId === r.jobId) ?? bg.find((s) => s.sessionId === info.sessionId)
        ?? bg.find((s) => sameDir(s.cwd) && s.startedAt >= info.startedAt))?.sessionId;
      if (!found) await new Promise((resolve) => setTimeout(resolve, deps.convertPollMs ?? 500));
    }
    res.json({ ...r, sessionId: found ?? info.sessionId });
  });

  if (deps.webDist && existsSync(deps.webDist)) {
    const dist = deps.webDist;
    app.use(express.static(dist));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
  } else {
    app.get('/', (_req, res) => res.type('text').send('网页尚未构建：先运行 npm run build -w web'));
  }

  return app;
}
