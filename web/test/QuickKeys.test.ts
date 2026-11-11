import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import QuickKeys from '../src/components/QuickKeys.vue';

beforeEach(() => localStorage.clear());

describe('QuickKeys', () => {
  it('shows the everyday keys with Enter first while collapsed, and emits the key name', async () => {
    const w = mount(QuickKeys);
    const names = w.findAll('button').map((b) => b.attributes('data-key'));
    expect(names).toEqual(['enter', 'esc', 'up', 'down', 'tab', 'paste', 'more']);
    await w.find('[data-key="esc"]').trigger('click');
    expect(w.emitted('key')).toEqual([['esc']]);
    await w.find('[data-key="paste"]').trigger('click'); // 粘贴按钮不发按键，只通知父组件唤出输入框
    expect(w.emitted('paste')).toHaveLength(1);
    expect(w.emitted('key')).toHaveLength(1);
  });

  it('expands to the full set, sends digits as plain text, and remembers the choice', async () => {
    const w = mount(QuickKeys);
    expect(w.find('[data-key="ctrl-o"]').exists()).toBe(false);
    await w.find('[data-key="more"]').trigger('click');
    for (const k of ['shift-tab', 'ctrl-c', 'left', 'right', 'home', 'end', 'backspace', 'delete', 'ctrl-j', 'ctrl-u', 'ctrl-w', 'pgup', 'pgdn', 'ctrl-o', 'ctrl-r', 'ctrl-t', 'ctrl-l']) {
      expect(w.find(`[data-key="${k}"]`).exists(), k).toBe(true);
    }
    await w.find('[data-key="d2"]').trigger('click');
    expect(w.emitted('text')).toEqual([['2']]);
    await w.find('[data-key="pgup"]').trigger('click');
    expect(w.emitted('key')).toEqual([['pgup']]);
    expect(mount(QuickKeys).find('[data-key="ctrl-o"]').exists()).toBe(true); // 下次打开仍是展开的
    await w.find('[data-key="more"]').trigger('click');
    expect(w.find('[data-key="ctrl-o"]').exists()).toBe(false);
    expect(mount(QuickKeys).find('[data-key="ctrl-o"]').exists()).toBe(false);
  });

  it('keeps the expand toggle usable while input is disabled', async () => {
    const w = mount(QuickKeys, { props: { disabled: true } });
    expect(w.find('[data-key="enter"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-key="more"]').attributes('disabled')).toBeUndefined();
  });
});
