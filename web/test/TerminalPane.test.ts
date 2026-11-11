import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

// vi.mock 会被提升到文件顶部，工厂里引用的对象必须用 vi.hoisted 定义
const { terms, FakeTerm } = vi.hoisted(() => {
  class FakeTerm {
    cols = 100;
    rows = 30;
    options = { fontSize: 13 };
    written: string[] = [];
    resetCount = 0;
    dataCb: ((d: string) => void) | null = null;
    textarea = document.createElement('textarea');
    element = document.createElement('div');
    constructor() { terms.push(this); }
    loadAddon() {}
    open(el: HTMLElement) { el.appendChild(this.element); this.element.appendChild(this.textarea); }
    write(d: string) { this.written.push(d); }
    reset() { this.resetCount += 1; }
    resize(c: number, r: number) { this.cols = c; this.rows = r; }
    onData(cb: (d: string) => void) { this.dataCb = cb; }
    dispose() {}
  }
  const terms: FakeTerm[] = [];
  return { terms, FakeTerm };
});
vi.mock('@xterm/xterm', () => ({ Terminal: FakeTerm }));
// 模拟真实字号下每行 fitCols 列；字号缩小后列数按比例变多。hidden 模拟标签页隐藏时量不出尺寸
const layout = vi.hoisted(() => ({ fitCols: 40, hidden: false }));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    proposeDimensions() {
      if (layout.hidden) return undefined;
      return { cols: Math.floor((layout.fitCols * 13) / terms.at(-1)!.options.fontSize), rows: 20 };
    }
    fit() {
      const d = this.proposeDimensions();
      if (!d) return;
      const t = terms.at(-1)!;
      t.cols = d.cols;
      t.rows = d.rows;
    }
  },
}));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

import TerminalPane from '../src/components/TerminalPane.vue';

describe('TerminalPane', () => {
  it('writes, clears, forwards input and reports active on focus', async () => {
    const w = mount(TerminalPane, { props: { minCols: 80 } });
    const vm = w.vm as unknown as { write: (d: string) => void; clear: () => void };
    vm.write('abc');
    vm.clear();
    const t = terms.at(-1)!;
    expect(t.written).toEqual(['abc']);
    expect(t.resetCount).toBe(1);
    t.dataCb!('x');
    expect(w.emitted('input')).toEqual([['x']]);
    t.textarea.dispatchEvent(new Event('focus'));
    expect(w.emitted('active')).toHaveLength(1);
  });
  it('turns a vertical touch drag into wheel events so phones can scroll the TUI', async () => {
    const w = mount(TerminalPane, { props: { minCols: 80 } });
    const t = terms.at(-1)!;
    const deltas: number[] = [];
    t.element.addEventListener('wheel', (e) => deltas.push((e as WheelEvent).deltaY));
    const host = w.find('.term');
    const touch = (type: string, y: number) => host.element.dispatchEvent(new TouchEvent(type, { touches: [{ clientY: y, clientX: 10 } as Touch], bubbles: true, cancelable: true }));
    touch('touchstart', 200);
    touch('touchmove', 140); // 手指上滑 60px：内容向下滚
    touch('touchmove', 260); // 再下滑 120px
    expect(deltas.length).toBeGreaterThanOrEqual(2);
    expect(deltas[0]).toBeGreaterThan(0);
    expect(deltas[deltas.length - 1]).toBeLessThan(0);
  });

  it('forwards IME clipboard text that xterm did not pick up, without duplicating what it did', async () => {
    vi.useFakeTimers();
    try {
      const w = mount(TerminalPane, { props: { minCols: 80 } });
      const t = terms.at(-1)!;
      const fire = (inputType: string, data: string | null) => {
        t.textarea.dispatchEvent(new InputEvent('beforeinput', { inputType, data }));
        t.textarea.dispatchEvent(new InputEvent('input', { inputType, data }));
      };
      fire('insertText', '粘贴的一段话'); // xterm 没反应：兜底转发
      vi.advanceTimersByTime(100);
      expect(w.emitted('input')).toEqual([['粘贴的一段话']]);

      t.textarea.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'a' }));
      t.dataCb!('a'); // xterm 自己发了：不重复
      t.textarea.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'a' }));
      vi.advanceTimersByTime(100);
      expect(w.emitted('input')).toEqual([['粘贴的一段话'], ['a']]);

      t.textarea.value = '剪贴板内容'; // 没有 paste 事件的 insertFromPaste：文字只在输入框里
      fire('insertFromPaste', null);
      vi.advanceTimersByTime(100);
      expect(w.emitted('input')?.at(-1)).toEqual(['剪贴板内容']);
      expect(t.textarea.value).toBe('');

      fire('insertCompositionText', '拼音'); // 拼音组合过程不转发
      vi.advanceTimersByTime(100);
      expect(w.emitted('input')).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps scrolling with inertia after a fast flick, and a new touch stops it', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    try {
      const w = mount(TerminalPane, { props: { minCols: 80 } });
      const t = terms.at(-1)!;
      let ticks = 0;
      t.element.addEventListener('wheel', () => { ticks += 1; });
      const host = w.find('.term').element;
      const touch = (type: string, y: number, ts: number) => {
        const e = new TouchEvent(type, { touches: type === 'touchend' ? [] : [{ clientY: y, clientX: 10 } as Touch], bubbles: true, cancelable: true });
        Object.defineProperty(e, 'timeStamp', { value: ts });
        host.dispatchEvent(e);
      };
      touch('touchstart', 300, 0);
      touch('touchmove', 250, 16);
      touch('touchmove', 200, 32);
      touch('touchend', 200, 40);
      const afterDrag = ticks;
      vi.advanceTimersByTime(200);
      expect(ticks).toBeGreaterThan(afterDrag);
      touch('touchstart', 200, 300); // 手指按住：惯性立刻停
      const held = ticks;
      vi.advanceTimersByTime(300);
      expect(ticks).toBe(held);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shrinks the font until minCols fit, and warns only when even the smallest font is too wide', async () => {
    layout.fitCols = 36;
    layout.hidden = false;
    const w = mount(TerminalPane, { props: { minCols: 40 } });
    (w.vm as unknown as { refit: () => void }).refit();
    await w.vm.$nextTick();
    const t = terms.at(-1)!;
    expect(t.options.fontSize).toBe(11);
    expect(w.emitted('resize')?.at(-1)).toEqual([42, 20]);
    expect(w.find('.hint').exists()).toBe(false);

    layout.fitCols = 20; // 最小字号 9 也只有 28 列
    (w.vm as unknown as { refit: () => void }).refit();
    await w.vm.$nextTick();
    expect(t.options.fontSize).toBe(9);
    expect(w.emitted('resize')?.at(-1)).toEqual([28, 20]);
    expect(w.find('.hint').text()).toContain('40');

    layout.fitCols = 60; // 横屏后恢复原字号
    (w.vm as unknown as { refit: () => void }).refit();
    expect(t.options.fontSize).toBe(13);
    expect(w.emitted('resize')?.at(-1)).toEqual([60, 20]);
  });

  it('mirrors the computer size with a smaller font and reports nothing while locked, then fits again when released', async () => {
    layout.fitCols = 48;
    layout.hidden = false;
    const w = mount(TerminalPane, { props: { minCols: 40, lockSize: { cols: 120, rows: 20 } } });
    const t = terms.at(-1)!;
    expect([t.cols, t.rows]).toEqual([120, 20]);
    expect(t.options.fontSize).toBe(5); // 13 × 48/120
    expect(w.emitted('resize')).toBeUndefined();
    await w.setProps({ lockSize: null });
    expect(t.options.fontSize).toBe(13);
    expect(w.emitted('resize')?.at(-1)).toEqual([48, 20]);
  });

  it('does not fit or report a size while hidden', async () => {
    layout.hidden = true;
    const w = mount(TerminalPane, { props: { minCols: 40 } });
    (w.vm as unknown as { refit: () => void }).refit();
    expect(w.emitted('resize')).toBeUndefined();
    layout.hidden = false;
    layout.fitCols = 48;
    (w.vm as unknown as { refit: () => void }).refit();
    expect(w.emitted('resize')).toEqual([[48, 20]]);
  });
});
