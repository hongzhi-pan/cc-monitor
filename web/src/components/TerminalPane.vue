<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const props = defineProps<{ minCols: number }>();
const emit = defineEmits<{ input: [data: string]; resize: [cols: number, rows: number]; active: [] }>();

const host = ref<HTMLElement | null>(null);
const narrow = ref(false);
let term: Terminal | null = null;
let fit: FitAddon | null = null;
let observer: ResizeObserver | null = null;

function write(data: string) {
  term?.write(data);
}

function clear() {
  term?.reset();
}

const BASE_FONT = 13;
const MIN_FONT = 9;

function refit() {
  if (!term || !fit) return;
  // 标签页隐藏时量不出尺寸：这时既不排版也不上报，否则会把 80×24 的默认值报给服务器
  const dims = fit.proposeDimensions();
  if (!dims || !Number.isFinite(dims.cols) || !Number.isFinite(dims.rows)) return;
  if (term.options.fontSize !== BASE_FONT) term.options.fontSize = BASE_FONT;
  fit.fit();
  if (term.cols < props.minCols) {
    // 屏幕太窄放不下最少列数：缩小字号让画面完整排进屏幕，而不是让服务器按更宽的尺寸画、到这里再折行
    term.options.fontSize = Math.max(MIN_FONT, Math.floor((BASE_FONT * term.cols) / props.minCols));
    fit.fit();
  }
  narrow.value = term.cols < props.minCols;
  emit('resize', term.cols, term.rows);
}

// 手机上没有滚轮：把手指的上下拖动换算成滚轮事件交给 xterm，
// Claude Code 开着鼠标跟踪时会收到滚动序列并滚动自己的内容。
// 手指每移动一行的高度就滚一行，画面跟手；松手后按离手速度带惯性继续滑一段
let lastTouchY: number | null = null;
let lastTouchT = 0;
let velocity = 0; // 像素/毫秒，向上滑为正
let pendingPx = 0;
let inertiaRaf = 0;

function lineHeight(): number {
  const h = host.value?.clientHeight ?? 0;
  return term && h > 0 ? Math.max(8, h / term.rows) : 17;
}
function scrollByPx(px: number) {
  if (!term?.element) return;
  pendingPx += px;
  const lines = Math.trunc(pendingPx / lineHeight());
  if (lines === 0) return;
  pendingPx -= lines * lineHeight();
  const step = Math.sign(lines);
  for (let i = 0; i < Math.abs(lines); i++) {
    term.element.dispatchEvent(new WheelEvent('wheel', { deltaY: step, deltaMode: 1, bubbles: true, cancelable: true }));
  }
}
function stopInertia() {
  if (inertiaRaf) cancelAnimationFrame(inertiaRaf);
  inertiaRaf = 0;
}
function onTouchStart(e: TouchEvent) {
  stopInertia();
  lastTouchY = e.touches[0]?.clientY ?? null;
  lastTouchT = e.timeStamp;
  velocity = 0;
  pendingPx = 0;
}
function onTouchMove(e: TouchEvent) {
  const y = e.touches[0]?.clientY;
  if (y === undefined || lastTouchY === null || !term?.element) return;
  e.preventDefault();
  const dy = lastTouchY - y;
  const dt = Math.max(1, e.timeStamp - lastTouchT);
  lastTouchY = y;
  lastTouchT = e.timeStamp;
  velocity = 0.6 * velocity + 0.4 * (dy / dt);
  scrollByPx(dy);
}
function onTouchEnd(e: TouchEvent) {
  lastTouchY = null;
  // 停住再抬手不算甩动
  if (e.timeStamp - lastTouchT > 80 || Math.abs(velocity) < 0.3 || typeof requestAnimationFrame === 'undefined') return;
  let prev = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(50, now - prev);
    prev = now;
    scrollByPx(velocity * dt);
    velocity *= Math.pow(0.95, dt / 16);
    inertiaRaf = Math.abs(velocity) > 0.05 ? requestAnimationFrame(tick) : 0;
  };
  inertiaRaf = requestAnimationFrame(tick);
}

onMounted(() => {
  term = new Terminal({
    fontSize: BASE_FONT,
    fontFamily: '"Cascadia Mono", "Cascadia Code", Consolas, "SF Mono", Menlo, monospace',
    cursorBlink: true,
    scrollback: 2000,
    theme: {
      background: '#0c0c0c',
      foreground: '#e6e6e6',
      cursor: '#d77757',
      cursorAccent: '#0c0c0c',
      selectionBackground: '#3a3a3a',
    },
  });
  fit = new FitAddon();
  term.loadAddon(fit);
  term.open(host.value!);
  term.onData((d) => emit('input', d));
  term.textarea?.addEventListener('focus', () => emit('active'));
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => refit());
    observer.observe(host.value!);
  }
  refit();
});

onBeforeUnmount(() => {
  stopInertia();
  observer?.disconnect();
  term?.dispose();
  term = null;
});

defineExpose({ write, clear, refit });
</script>

<template>
  <div class="wrap">
    <p v-if="narrow" class="hint">⚠ 字号已缩到最小，宽度仍不足 {{ minCols }} 列，画面可能折行，横屏后更清楚</p>
    <div ref="host" class="term" @touchstart.passive="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd" @touchcancel="onTouchEnd" />
  </div>
</template>

<style scoped>
.wrap { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.hint { margin: 0; padding: 4px 12px; font-size: 12px; color: var(--yellow); }
.term { flex: 1; min-height: 0; padding: 4px; touch-action: none; }
</style>
