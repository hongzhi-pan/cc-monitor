export const PASTE_START = '\x1b[200~';
export const PASTE_END = '\x1b[201~';

export const KEY_SEQUENCES: Record<string, string> = {
  esc: '\x1b',
  'ctrl-c': '\x03',
  tab: '\t',
  'shift-tab': '\x1b[Z',
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
  enter: '\r',
  backspace: '\x7f',
  delete: '\x1b[3~',
  home: '\x1b[H',
  end: '\x1b[F',
  pgup: '\x1b[5~',
  pgdn: '\x1b[6~',
  'ctrl-a': '\x01',
  'ctrl-e': '\x05',
  'ctrl-j': '\n',
  'ctrl-l': '\x0c',
  'ctrl-o': '\x0f',
  'ctrl-r': '\x12',
  'ctrl-t': '\x14',
  'ctrl-u': '\x15',
  'ctrl-w': '\x17',
};

export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function composePaste(text: string): string {
  return PASTE_START + normalizeNewlines(text) + PASTE_END;
}

export function keyToSequence(name: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(KEY_SEQUENCES, name) ? KEY_SEQUENCES[name] : undefined;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function sendPaste(
  write: (s: string) => void,
  text: string,
  delayMs = 50,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<void> {
  write(composePaste(text));
  await sleep(delayMs);
  write('\r');
}
