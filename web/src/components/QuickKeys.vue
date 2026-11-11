<script setup lang="ts">
import { ref } from 'vue';

defineProps<{ disabled?: boolean; pasteOpen?: boolean }>();
const emit = defineEmits<{ key: [name: string]; text: [chars: string]; paste: [] }>();

interface Key { name: string; label: string; text?: string }
// 常驻的一行：手机上最常用的。回车放第一个，最不该被挤到屏幕外
const primary: Key[] = [
  { name: 'enter', label: 'Enter' }, { name: 'esc', label: 'Esc' },
  { name: 'up', label: '↑' }, { name: 'down', label: '↓' }, { name: 'tab', label: 'Tab' },
];
// 展开后才显示，按用途分组，每组一行
const groups: Key[][] = [
  // 选项菜单、权限确认里直接按数字
  [{ name: 'd1', label: '1', text: '1' }, { name: 'd2', label: '2', text: '2' }, { name: 'd3', label: '3', text: '3' }, { name: 'd4', label: '4', text: '4' },
    { name: 'shift-tab', label: 'S+Tab' }, { name: 'ctrl-c', label: 'Ctrl+C' }],
  // 光标与编辑
  [{ name: 'left', label: '←' }, { name: 'right', label: '→' }, { name: 'home', label: 'Home' }, { name: 'end', label: 'End' },
    { name: 'backspace', label: '⌫' }, { name: 'delete', label: 'Del' }, { name: 'ctrl-j', label: '换行' }],
  [{ name: 'ctrl-u', label: '清行' }, { name: 'ctrl-w', label: '删词' }, { name: 'pgup', label: 'PgUp' }, { name: 'pgdn', label: 'PgDn' }],
  // Claude Code 自己的快捷键
  [{ name: 'ctrl-o', label: 'Ctrl+O' }, { name: 'ctrl-r', label: 'Ctrl+R' }, { name: 'ctrl-t', label: 'Ctrl+T' }, { name: 'ctrl-l', label: 'Ctrl+L' }],
];

const STORE = 'ccm.keysOpen';
function readOpen(): boolean {
  try { return localStorage.getItem(STORE) === '1'; } catch { return false; }
}
const open = ref(readOpen());
function toggle() {
  open.value = !open.value;
  try { localStorage.setItem(STORE, open.value ? '1' : '0'); } catch { /* 隐私模式下记不住也无妨 */ }
}

function press(k: Key) {
  if (k.text !== undefined) emit('text', k.text);
  else emit('key', k.name);
}
</script>

<template>
  <div class="keys">
    <div class="row">
      <button v-for="k in primary" :key="k.name" :data-key="k.name" class="key" :disabled="disabled" @click="press(k)">{{ k.label }}</button>
      <!-- 终端里长按粘贴不了：点这里弹出输入框，粘贴或打字后发送 -->
      <button data-key="paste" class="key" :class="{ on: pasteOpen }" :disabled="disabled" @click="emit('paste')">粘贴</button>
      <button data-key="more" class="key more" :class="{ on: open }" :aria-expanded="open" @click="toggle">{{ open ? '收起 ▾' : '更多 ▴' }}</button>
    </div>
    <template v-if="open">
      <div v-for="(g, i) in groups" :key="i" class="row">
        <button v-for="k in g" :key="k.name" :data-key="k.name" class="key" :disabled="disabled" @click="press(k)">{{ k.label }}</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 换行排布而不是横向滚动：窄屏上所有按键都看得见，按键够大好点 */
.keys { padding: 2px 6px; font-size: 12px; border-top: 1px solid var(--line); background: var(--bg); }
.row { display: flex; flex-wrap: wrap; gap: 2px 0; }
.key { flex: 0 0 auto; min-height: 30px; padding: 4px 3px; }
.key.more { margin-left: auto; color: var(--dim); }
.key[data-key="enter"], .key.on { color: var(--orange); }
.key[data-key="enter"]::before, .key[data-key="enter"]::after, .key.on::before, .key.on::after { color: var(--orange); }
</style>
