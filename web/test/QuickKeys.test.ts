import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import QuickKeys from '../src/components/QuickKeys.vue';

describe('QuickKeys', () => {
  it('puts Enter first and emits the key name for each button', async () => {
    const w = mount(QuickKeys);
    const names = w.findAll('button').map((b) => b.attributes('data-key'));
    expect(names).toEqual(['enter', 'esc', 'tab', 'shift-tab', 'up', 'down', 'left', 'right', 'ctrl-c', 'paste']);
    await w.find('[data-key="esc"]').trigger('click');
    expect(w.emitted('key')).toEqual([['esc']]);
    await w.find('[data-key="paste"]').trigger('click'); // 粘贴按钮不发按键，只通知父组件唤出输入框
    expect(w.emitted('paste')).toHaveLength(1);
    expect(w.emitted('key')).toHaveLength(1);
  });
});
