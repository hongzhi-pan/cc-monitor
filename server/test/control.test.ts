import { describe, it, expect } from 'vitest';
import { stopSession, convertToBackground, type ClaudeRunner, type ConvertDeps } from '../src/control.js';

function fakeRunner(code: number, stdout: string) {
  const calls: string[][] = [];
  const run: ClaudeRunner = async (args) => { calls.push(args); return { code, stdout }; };
  return { run, calls };
}

describe('stopSession', () => {
  it('runs claude stop with the job id and reports success', async () => {
    const { run, calls } = fakeRunner(0, 'stopped 49fbe6a0\n');
    const r = await stopSession('49fbe6a0', run);
    expect(calls).toEqual([['stop', '49fbe6a0']]);
    expect(r).toEqual({ ok: true, output: 'stopped 49fbe6a0' });
  });
  it('reports failure when claude exits non-zero', async () => {
    const { run } = fakeRunner(1, 'no such session');
    const r = await stopSession('49fbe6a0', run);
    expect(r.ok).toBe(false);
    expect(r.output).toContain('no such session');
  });
  it('refuses ids that are not an 8-char hex job id without running anything', async () => {
    const { run, calls } = fakeRunner(0, '');
    const r = await stopSession('../x; rm', run);
    expect(r.ok).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe('convertToBackground', () => {
  const SID = '64b4d103-5f51-4993-bdf5-10324f9dfefa';
  function deps(killOk: boolean, code: number, stdout: string) {
    const log: string[] = [];
    const d: ConvertDeps = {
      kill: async (pid) => { log.push(`kill ${pid}`); return killOk; },
      run: async (args, cwd) => { log.push(`run ${args.join(' ')} @ ${cwd}`); return { code, stdout }; },
      sleep: async () => {},
    };
    return { d, log };
  }
  it('kills the foreground process, then resumes the same conversation in the background', async () => {
    const { d, log } = deps(true, 0, 'Started background session a1b2c3d4\n');
    const r = await convertToBackground({ pid: 7288, sessionId: SID, cwd: 'C:/p' }, d);
    expect(log).toEqual(['kill 7288', `run --bg --resume ${SID} @ C:/p`]);
    expect(r).toMatchObject({ ok: true, jobId: 'a1b2c3d4' });
  });
  it('leaves the session alone when the process cannot be ended', async () => {
    const { d, log } = deps(false, 0, '');
    const r = await convertToBackground({ pid: 7288, sessionId: SID, cwd: 'C:/p' }, d);
    expect(r.ok).toBe(false);
    expect(log).toEqual(['kill 7288']);
  });
  it('tells the user how to recover when the background start fails', async () => {
    const { d } = deps(true, 1, 'daemon not running');
    const r = await convertToBackground({ pid: 7288, sessionId: SID, cwd: 'C:/p' }, d);
    expect(r.ok).toBe(false);
    expect(r.output).toContain('daemon not running');
    expect(r.output).toContain(`claude --bg --resume ${SID}`);
  });
  it('refuses malformed ids without touching anything', async () => {
    const { d, log } = deps(true, 0, '');
    expect((await convertToBackground({ pid: 7288, sessionId: 'x; calc', cwd: 'C:/p' }, d)).ok).toBe(false);
    expect((await convertToBackground({ pid: 0, sessionId: SID, cwd: 'C:/p' }, d)).ok).toBe(false);
    expect(log).toEqual([]);
  });
});
