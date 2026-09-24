// Thin adb driver for guide screenshots on an Android emulator. It reads the
// UI through `uiautomator dump`, taps element centres and captures PNGs.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const exe = (dir, name) => join(sdk || '', dir, process.platform === 'win32' ? `${name}.exe` : name);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function androidAvailable(avd) {
  if (!sdk || !existsSync(exe('emulator', 'emulator')) || !existsSync(exe('platform-tools', 'adb'))) return 'ANDROID_HOME with emulator and platform-tools is not set up';
  const avds = execFileSync(exe('emulator', 'emulator'), ['-list-avds'], { encoding: 'utf8' }).split(/\r?\n/);
  return avds.includes(avd) ? null : `AVD '${avd}' does not exist (see README: Mobile apps)`;
}

export async function bootEmulator({ avd, port = 5580 }) {
  const serial = `emulator-${port}`;
  // -wipe-data resets the guide AVD, so every run starts from a clean device without accounts.
  const child = spawn(exe('emulator', 'emulator'), ['-avd', avd, '-port', String(port), '-no-window', '-no-audio', '-no-boot-anim', '-no-snapshot', '-wipe-data', '-gpu', 'swiftshader_indirect'], { stdio: 'ignore', detached: false });
  const device = new Device(serial, child);
  for (let i = 0; i < 90; i++) {
    try { if (device.shell('getprop', 'sys.boot_completed').trim() === '1') break; } catch (_) { /* adb not ready yet */ }
    await sleep(3000);
    if (i === 89) { device.stop(); throw new Error('emulator did not boot within 270 s'); }
  }
  for (const key of ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale']) device.shell('settings', 'put', 'global', key, '0');
  device.shell('settings', 'put', 'system', 'screen_off_timeout', '1800000');
  device.shell('input', 'keyevent', 'KEYCODE_WAKEUP');
  device.shell('wm', 'dismiss-keyguard');
  return device;
}

export class Device {
  constructor(serial, child) { this.serial = serial; this.child = child; }

  adb(...args) { return execFileSync(exe('platform-tools', 'adb'), ['-s', this.serial, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
  shell(...args) { return this.adb('shell', ...args); }
  stop() {
    try { this.adb('emu', 'kill'); } catch (_) { /* already gone */ }
    try { this.child?.kill(); } catch (_) { /* already gone */ }
  }

  install(apk) { this.adb('install', '-r', '-g', apk); }

  screenshotPng() {
    return execFileSync(exe('platform-tools', 'adb'), ['-s', this.serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  }

  nodes() {
    let xml = '';
    for (let attempt = 0; attempt < 3 && !xml.includes('<hierarchy'); attempt++) {
      try { xml = this.adb('exec-out', 'uiautomator', 'dump', '/dev/tty'); } catch (_) { xml = ''; }
    }
    const list = [];
    for (const match of xml.matchAll(/<node ([^>]*?)\/?>/g)) {
      const attrs = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#10;/g, '\n')]));
      const b = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(attrs.bounds || '');
      if (!b) continue;
      list.push({ ...attrs, x1: +b[1], y1: +b[2], x2: +b[3], y2: +b[4] });
    }
    return list;
  }

  // query: { text, desc, id, hint } as string (exact) or RegExp.
  find(query) {
    const test = (value, want) => (want instanceof RegExp ? want.test(value || '') : value === want);
    return this.nodes().find((n) => (!query.text || test(n.text, query.text))
      && (!query.desc || test(n['content-desc'], query.desc))
      && (!query.id || test(n['resource-id'], query.id))
      && (!query.hint || test(n.hint, query.hint))
      && n.x2 > n.x1 && n.y2 > n.y1);
  }

  async waitFor(query, timeout = 30000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const node = this.find(query);
      if (node) return node;
      await sleep(700);
    }
    throw new Error(`android element not found: ${JSON.stringify(query, (k, v) => (v instanceof RegExp ? String(v) : v))}`);
  }

  async tap(query, timeout) {
    const node = await this.waitFor(query, timeout);
    this.shell('input', 'tap', String(Math.round((node.x1 + node.x2) / 2)), String(Math.round((node.y1 + node.y2) / 2)));
    await sleep(900);
    return node;
  }

  async type(text) {
    // `input text` needs spaces as %s and shell metacharacters escaped.
    const escaped = text.replace(/([\\'"`$&|;<>()])/g, '\\$1').replace(/ /g, '%s');
    this.shell('input', 'text', escaped);
    await sleep(500);
  }

  async key(code) { this.shell('input', 'keyevent', code); await sleep(700); }

  size() {
    const m = /(\d+)x(\d+)/.exec(this.shell('wm', 'size'));
    return { width: +m[1], height: +m[2] };
  }
}
