import type { Action } from '../types/script.js';
import type { CursorTelemetry } from '../types/recording.js';
import type {
  RecordingAdapter,
  RecordingSession,
} from './types.js';

export interface TauriPlaywrightPage {
  startRecording(options: { path: string; fps: number }): Promise<void>;
  stopRecording(): Promise<{ video: string }>;
  evaluate<T>(script: string | (() => T) | (() => Promise<T>)): Promise<T>;
  addInitScript(fn: () => void): Promise<void>;
  click(selector: string): Promise<void>;
  pointerClick(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  press(selector: string, key: string): Promise<void>;
  hover(selector: string): Promise<void>;
  type(selector: string, value: string): Promise<void>;
  goto(url: string): Promise<void>;
  visit(url: string): Promise<void>;
  waitForSelector(selector: string, timeout?: number): Promise<void>;
  waitForFunction(expression: string, timeout?: number): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  waitFor(ms: number): Promise<void>;
  screenshot(options?: { path?: string }): Promise<Buffer | void>;
  mouseMove(x: number, y: number): Promise<void>;
  /**
   * Resolve the plugin's textual selectors (e.g. `text=Send`) to a CSS path.
   * Optional: sessions fall back to using the selector as-is.
   */
  resolveTextSelector?(selector: string): Promise<string>;
  close(): Promise<void>;
  [key: string]: unknown;
}

interface TauriPlaywrightModule {
  launch?(
    options?: { viewport?: { width: number; height: number } },
  ): Promise<TauriPlaywrightPage>;
}

export interface TauriPlaywrightAdapterOptions {
  module?: TauriPlaywrightModule;
  socketPath?: string;
  tcpPort?: number;
  /**
   * Per-character typing delay in ms. Smaller is faster. Long values (past
   * ~60 chars) are typed at a faster effective rate.
   */
  typingSpeedMs?: number;
}

// Instance types for tauri-playwright v0.4+
interface PluginClientInstance {
  connect(): Promise<void>;
  disconnect(): void;
}

interface TauriPageInstance {
  goto(url: string): Promise<void>;
  click(selector: string): Promise<void>;
  fill(selector: string, text: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  press(selector: string, key: string): Promise<void>;
  hover(selector: string): Promise<void>;
  screenshot(options?: { path: string }): Promise<{ data?: { base64?: string } }>;
  startRecording(options: { path: string; fps: number }): Promise<unknown>;
  stopRecording(): Promise<{ video: string }>;
  evaluate(script: string): Promise<unknown>;
  waitForSelector(selector: string, timeout?: number): Promise<void>;
  waitForFunction(expression: string, timeout?: number): Promise<void>;
  mouse?: {
    move(x: number, y: number): Promise<void>;
  };
  [key: string]: unknown;
}

interface TauriPlaywrightPluginModule {
  PluginClient: new (
    socketPath?: string | null,
    tcpPort?: number,
  ) => PluginClientInstance;
  TauriPage: new (client: PluginClientInstance) => TauriPageInstance;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

const TEXT_SEL_RE = /^text=(.+)$/s;
const LAST_SEL_RE = /^last=(.+)$/s;

function cssPathForLast(selector: string): string {
  return `(function(){
var sel=${JSON.stringify(selector)};
function cssPath(el){
  if(!el)return '';
  var tag=el.tagName.toLowerCase();
  if(el.id)return tag+'#'+CSS.escape(el.id);
  var p=el.parentNode;if(!p)return tag;
  var s=[].slice.call(p.children).filter(function(c){return c.tagName.toLowerCase()===tag;});
  if(s.length===1)return cssPath(p)+' > '+tag;
  var i=[].slice.call(p.children).indexOf(el)+1;
  return cssPath(p)+' > '+tag+':nth-child('+i+')';
}
var els=document.querySelectorAll(sel);
var visible=null;
for(var i=0;i<els.length;i++){
  var el=els[i];
  if(el.offsetParent===null)continue;
  visible=el;
}
if(!visible)throw new Error('last selector not found: '+sel);
return cssPath(visible);
})()`;
}

function cssPathForText(text: string): string {
  return `(function(){
var text=${JSON.stringify(text)};
function cssPath(el){
  if(!el)return '';
  var tag=el.tagName.toLowerCase();
  if(el.id)return tag+'#'+CSS.escape(el.id);
  var p=el.parentNode;if(!p)return tag;
  var s=[].slice.call(p.children).filter(function(c){return c.tagName.toLowerCase()===tag;});
  if(s.length===1)return cssPath(p)+' > '+tag;
  var i=[].slice.call(p.children).indexOf(el)+1;
  return cssPath(p)+' > '+tag+':nth-child('+i+')';
}
var els=document.querySelectorAll('button,[role="button"],[role="tab"],a,[role="menuitem"],[role="option"],[data-testid],[aria-label]');
var exact=null;var partial=null;
for(var i=0;i<els.length;i++){
  var el=els[i];
  var t=(el.textContent||'').replace(/\\s+/g,' ').trim();
  if(t===text){exact=el;break;}
  if(!partial&&t.indexOf(text)>=0)partial=el;
}
var hit=exact||partial;
if(!hit)throw new Error('text selector not found: '+text);
return cssPath(hit);
})()`;
}

async function resolveSelector(
  page: TauriPageInstance,
  selector: string,
): Promise<string> {
  const lastMatch = LAST_SEL_RE.exec(selector);
  if (lastMatch) {
    const cssPath = await page.evaluate(cssPathForLast(lastMatch[1]!));
    if (typeof cssPath === 'string' && cssPath.length > 0) return cssPath;
    throw new Error(`last selector resolved to empty path: "${selector}"`);
  }
  const m = TEXT_SEL_RE.exec(selector);
  if (!m) return selector;
  const cssPath = await page.evaluate(cssPathForText(m[1]!));
  if (typeof cssPath === 'string' && cssPath.length > 0) return cssPath;
  throw new Error(`text selector resolved to empty path: "${selector}"`);
}

// The plugin's `fill`/`type_text` only touch HTMLInputElement.prototype, so
// they throw on <textarea> elements (e.g. the chat composer). Set the value
// through the correct prototype and notify React with native events.
function setValueJs(selector: string, value: string): string {
  return `(function(){
var sel=${JSON.stringify(selector)};
var value=${JSON.stringify(value)};
var el=document.querySelector(sel);
if(!el) throw new Error('set value: no element '+sel);
var proto=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
var desc=Object.getOwnPropertyDescriptor(proto,'value');
if(desc&&desc.set){desc.set.call(el,value);}else{el.value=value;}
el.dispatchEvent(new Event('input',{bubbles:true}));
el.dispatchEvent(new Event('change',{bubbles:true}));
return el.value;
})()`;
}

async function setValue(
  page: TauriPageInstance,
  selector: string,
  value: string,
): Promise<void> {
  const resolved = await resolveSelector(page, selector);
  const applied = await page.evaluate(setValueJs(resolved, value));
  if (typeof applied !== 'string') {
    throw new Error(`set value: unexpected result for "${selector}"`);
  }
}

// ── Humanized typing ────────────────────────────────────────────────────────

function focusFieldJs(selector: string): string {
  return `(function(){
var sel=${JSON.stringify(selector)};
var el=document.querySelector(sel);
if(!el) throw new Error('type: no element '+sel);
el.scrollIntoView({block:'center',inline:'center'});
el.focus();
var len=el.value?el.value.length:0;
try{
  if(el.setSelectionRange) el.setSelectionRange(len,len);
  if(window.getSelection){var s=window.getSelection();if(s&&typeof s.collapse==='function'){s.collapse(el,len);}}
}catch(e){}
return true;
})()`;
}

/**
 * Inserts a single character at the end of the field value. Uses native
 * `execCommand('insertText')` (respects React's composition and fires a real
 * input event), falling back to the prototype value setter + input event.
 * `current` is the full accumulated value for the fallback path.
 */
function insertCharJs(selector: string, current: string, char: string): string {
  return `(function(){
var sel=${JSON.stringify(selector)};
var cur=${JSON.stringify(current)};
var ch=${JSON.stringify(char)};
var el=document.querySelector(sel);
if(!el) throw new Error('type: no element '+sel);
el.focus();
try{
  var start=cur.length-1;
  if(el.setSelectionRange) el.setSelectionRange(start,start);
  var ok=document.execCommand('insertText',false,ch);
  if(ok) return true;
}catch(e){}
var proto=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
var desc=Object.getOwnPropertyDescriptor(proto,'value');
if(desc&&desc.set){desc.set.call(el,cur);}else{el.value=cur;}
el.dispatchEvent(new Event('input',{bubbles:true}));
return true;
})()`;
}

function delayForChar(char: string, baseMs: number): number {
  let delay = baseMs;
  if (/\s/.test(char)) delay += 120 + Math.random() * 160;
  else if (/[.,;:!?]/.test(char)) delay += 150 + Math.random() * 180;
  else delay += Math.random() * baseMs * 0.45;
  delay += Math.random() * baseMs * 0.6;
  return Math.max(8, delay);
}

/**
 * Types `value` character-by-character with human jitter so the demo's on
 * screen text visibly assembles while being spoken. Long values are typed at
 * a faster effective rate so they don't stall the narration.
 */
async function typeHumanized(
  rawPage: TauriPageInstance,
  selector: string,
  value: string,
  typingSpeedMs: number,
): Promise<void> {
  const resolved = await resolveSelector(rawPage, selector);
  const baseDelay = typingSpeedMs > 0 ? typingSpeedMs : 50;
  const effectiveDelay =
    value.length > 60
      ? Math.max(16, Math.round(baseDelay * 0.5))
      : baseDelay;

  await rawPage.evaluate(focusFieldJs(resolved));

  let current = '';
  for (const char of value) {
    current += char;
    await rawPage.evaluate(insertCharJs(resolved, current, char));
    await sleep(delayForChar(char, effectiveDelay));
  }
}

// ── Bridge ─────────────────────────────────────────────────────────────────

function wrapTauriPage(
  rawPage: TauriPageInstance,
  client?: PluginClientInstance,
  typingSpeedMs?: number,
): TauriPlaywrightPage {
  return {
    startRecording: (opts) => rawPage.startRecording(opts) as Promise<void>,
    stopRecording: () => rawPage.stopRecording(),
    evaluate: async (script) => {
      if (typeof script === 'function') {
        return (await rawPage.evaluate(`(${script.toString()})()`)) as never;
      }
      return (await rawPage.evaluate(script)) as never;
    },
    addInitScript: async (fn) => {
      try {
        await rawPage.evaluate(`(${fn.toString()})()`);
      } catch { /* telemetry init is best-effort */ }
    },
    click: async (selector) => {
      await rawPage.click(await resolveSelector(rawPage, selector));
    },
    pointerClick: async (selector) => {
      const resolved = await resolveSelector(rawPage, selector);
      await rawPage.evaluate(
        `(function(){
          var q=document.querySelector(${JSON.stringify(resolved)});
          if(!q) return;
          try{ q.scrollIntoView({block:'center',inline:'center'}); }catch(e){}
          var vw=(window.innerWidth||1280), vh=(window.innerHeight||800);
          var r=q.getBoundingClientRect();
          var cx=Math.max(0,Math.min(vw,r.left+r.width/2));
          var cy=Math.max(0,Math.min(vh,r.top+r.height/2));
          var o={bubbles:true,cancelable:true,view:window,clientX:cx,clientY:cy};
          q.dispatchEvent(new PointerEvent('pointerdown',o));
          q.dispatchEvent(new MouseEvent('mousedown',o));
          q.dispatchEvent(new PointerEvent('pointerup',o));
          q.dispatchEvent(new MouseEvent('mouseup',o));
          q.dispatchEvent(new MouseEvent('click',o));
        })()`,
      );
    },
    hover: async (selector) => {
      await rawPage.hover(await resolveSelector(rawPage, selector));
    },
    fill: async (selector, value) => {
      await setValue(rawPage, selector, value);
    },
    type: async (selector, value) => {
      await typeHumanized(rawPage, selector, value, typingSpeedMs ?? 50);
    },
    press: async (selector, key) => {
      await rawPage.press(await resolveSelector(rawPage, selector), key);
    },
    mouseMove: async (x, y) => {
      if (rawPage.mouse?.move) await rawPage.mouse.move(x, y);
    },
    resolveTextSelector: async (selector) => resolveSelector(rawPage, selector),
    goto: (url) => rawPage.goto(url),
    visit: (url) => rawPage.goto(url),
    waitForFunction: (expr, timeout) => rawPage.waitForFunction(expr, timeout),
    waitForSelector: async (selector, timeout) => {
      await rawPage.waitForSelector(
        await resolveSelector(rawPage, selector),
        timeout,
      );
    },
    waitForTimeout: (ms) => sleep(ms),
    waitFor: (ms) => sleep(ms),
    screenshot: async (opts) => {
      const res = await rawPage.screenshot({ path: opts?.path ?? '' });
      return res?.data?.base64 ? Buffer.from(res.data.base64, 'base64') : Buffer.alloc(0);
    },
    close: async () => {
      client?.disconnect();
    },
  } as TauriPlaywrightPage;
}

function isModuleWithLaunch(
  v: TauriPlaywrightAdapterOptions | TauriPlaywrightModule,
): v is TauriPlaywrightModule & {
  launch: NonNullable<TauriPlaywrightModule['launch']>;
} {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as TauriPlaywrightModule).launch === 'function'
  );
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Create a recording adapter backed by `@srsholmes/tauri-playwright`.
 *
 * Usage patterns:
 * ```ts
 * // Module override (legacy/tests)
 * createTauriPlaywrightAdapter({ launch: async () => page })
 * // Connect to already-running app via plugin socket (tauri-playwright ≥ 0.4)
 * createTauriPlaywrightAdapter({ socketPath: '/tmp/tauri-playwright.sock' })
 * // Use installed package
 * createTauriPlaywrightAdapter({})
 * ```
 */
export function createTauriPlaywrightAdapter(
  options: TauriPlaywrightAdapterOptions | TauriPlaywrightModule = {},
): RecordingAdapter {
  if (isModuleWithLaunch(options)) {
    return buildAdapterWithLaunch(options);
  }

  const opts = options as TauriPlaywrightAdapterOptions;

  return {
    async launch(launchOptions) {
      let page: TauriPlaywrightPage;
      const viewport = launchOptions.viewport ?? DEFAULT_VIEWPORT;

      if (opts.module?.launch) {
        page = await opts.module.launch(
          launchOptions.viewport ? { viewport: launchOptions.viewport } : {},
        );
      } else {
        const tpMod = (await import(
          '@srsholmes/tauri-playwright'
        )) as unknown as TauriPlaywrightPluginModule;

        if (
          typeof (
            tpMod as unknown as { launch?: unknown }
          ).launch === 'function'
        ) {
          page = await (
            tpMod as unknown as TauriPlaywrightModule
          ).launch!(
            launchOptions.viewport ? { viewport: launchOptions.viewport } : {},
          );
        } else {
          const { PluginClient, TauriPage } = tpMod;
          const client = new PluginClient(
            opts.socketPath ?? '/tmp/tauri-playwright.sock',
            opts.tcpPort,
          );
          await client.connect();
          page = wrapTauriPage(
            new TauriPage(client),
            client,
            opts.typingSpeedMs,
          );
        }
      }

      await page.addInitScript(TELEMETRY_INIT);
      return new TauriPlaywrightSession(
        page,
        viewport,
        opts.socketPath ?? '/tmp/tauri-playwright.sock',
      );
    },
  };
}

function buildAdapterWithLaunch(launchFn: {
  launch: NonNullable<TauriPlaywrightModule['launch']>;
}): RecordingAdapter {
  return {
    async launch(launchOptions) {
      const page = await launchFn.launch(
        launchOptions.viewport ? { viewport: launchOptions.viewport } : {},
      );
      await page.addInitScript(TELEMETRY_INIT);
      return new TauriPlaywrightSession(
        page,
        launchOptions.viewport ?? DEFAULT_VIEWPORT,
      );
    },
  };
}

// ── Session ────────────────────────────────────────────────────────────────

const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

function elementCenterJs(selector: string): string {
  return `(function(){
var el=document.querySelector(${JSON.stringify(selector)});
if(!el) return null;
try{ el.scrollIntoView({block:'center',inline:'center'}); }catch(e){}
var vw=(window.innerWidth||1280), vh=(window.innerHeight||800);
var r=el.getBoundingClientRect();
return {
  x: Math.max(0,Math.min(vw,r.left+r.width/2)),
  y: Math.max(0,Math.min(vh,r.top+r.height/2)),
  w:r.width, h:r.height
};
})()`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Best-effort: bring the app owning the playwright socket to the foreground.
 *
 * The tauri-playwright native capture path (`CGWindowListCreateImage`) returns an
 * empty/blank surface for the recorded window whenever another window occludes
 * it, so a window left behind others records as white frames. Raising the app's
 * window to the front right before recording starts keeps the surface visible.
 */
async function raiseAppWindow(socketPath?: string): Promise<void> {
  const socket = socketPath ?? '/tmp/tauri-playwright.sock';
  try {
    const { spawnSync } = await import('node:child_process');
    const pid = spawnSync('lsof', ['-t', socket], { encoding: 'utf8' });
    const parsed = Number((pid.stdout ?? '').trim().split('\n')[0]);
    if (!Number.isInteger(parsed) || parsed <= 0) return;
    spawnSync(
      'osascript',
      [
        '-e',
        `tell application "System Events" to set frontmost of first process whose unix id is ${parsed} to true`,
      ],
      { timeout: 5000 },
    );
  } catch {
    // Raising the window is best-effort; never break recording over it.
  }
}

class TauriPlaywrightSession implements RecordingSession {
  private readonly cursorStart: { x: number; y: number };
  private cursorPos: { x: number; y: number };
  private recording = false;

  constructor(
    private readonly page: TauriPlaywrightPage,
    viewport: { width: number; height: number },
    private readonly socketPath?: string,
  ) {
    this.cursorStart = {
      x: Math.round(viewport.width * 0.5),
      y: Math.round(viewport.height * 0.4),
    };
    this.cursorPos = { ...this.cursorStart };
  }

  async startRecording(options: { path: string; fps: number }): Promise<void> {
    // Self-heal: a previously aborted/killed process may leave the plugin's
    // recorder in "in progress" state, which makes startRecording throw.
    // Best-effort stop (ignored when nothing is in progress) clears it.
    try {
      await this.page.stopRecording();
    } catch {
      // ignore: no recording in progress
    }
    this.recording = true;
    await raiseAppWindow(this.socketPath);
    await this.page.evaluate(() => {
      const w = window as unknown as {
        __cursorTelemetry?: unknown[];
        __cursorTelemetryTimebase?: number | null;
        __cursorTelemetryWallBase?: number | null;
        __telemetryRecording?: boolean;
        __telemetryHeartbeat?: number | null;
        __TP_PUSH?: (type: string, x: number, y: number) => void;
      };
      w.__cursorTelemetryTimebase = performance.now();
      w.__cursorTelemetryWallBase = Date.now();
      w.__cursorTelemetry = [];
      w.__telemetryRecording = true;
      // Parked-cursor heartbeat: the plugin's scripted actions do not emit
      // page-level mousemove events, so replay the last known cursor position
      // every 100ms while recording. This gives dwell/click detectors a dense
      // telemetry stream even when the pointer is stationary between actions.
      if (w.__telemetryHeartbeat) {
        clearInterval(w.__telemetryHeartbeat as number);
      }
      w.__telemetryHeartbeat = setInterval(() => {
        const ww = window as unknown as {
          __cursorTelemetry?: unknown[];
          __telemetryRecording?: boolean;
          __cursorLastX?: number;
          __cursorLastY?: number;
          __TP_PUSH?: (type: string, x: number, y: number) => void;
        };
        if (!ww.__telemetryRecording) return;
        if (ww.__cursorLastX == null || ww.__cursorLastY == null) return;
        ww.__TP_PUSH?.('move', ww.__cursorLastX, ww.__cursorLastY);
      }, 100) as unknown as number;
    });
    await this.page.startRecording(options);
  }

  async stopRecording(): Promise<{ video: string }> {
    this.recording = false;
    await this.page.evaluate(() => {
      const w = window as unknown as { __telemetryRecording?: boolean };
      w.__telemetryRecording = false;
    });
    return this.page.stopRecording();
  }

  async executeAction(action: Action): Promise<void> {
    const method = (this.page as Record<string, unknown>)[action.name];
    if (typeof method !== 'function') {
      throw new Error(`Unknown action: ${action.name}`);
    }
    await (method as (...args: unknown[]) => Promise<void>).apply(
      this.page,
      action.args,
    );
    // Record the pointer press at the swept target so zoom analysis sees it.
    if (
      (action.name === 'click' || action.name === 'dblclick' || action.name === 'pointerClick') &&
      this.recording
    ) {
      await this.pushTelemetry('click', this.cursorPos.x, this.cursorPos.y);
    }
  }

  private async pushTelemetry(
    type: 'move' | 'click',
    x: number,
    y: number,
  ): Promise<void> {
    try {
      const px = Math.round(x);
      const py = Math.round(y);
      await this.page.evaluate(
        `(function(){var p=window;var push=p.__TP_PUSH;
         if(typeof push==='function'){push(${JSON.stringify(type)},${px},${py});return;}
         p.__cursorLastX=${px};p.__cursorLastY=${py};
         if(p.__cursorTelemetry){p.__cursorTelemetry.push({t:performance.now(),x:${px},y:${py},type:${JSON.stringify(type)}});}
        })()`,
      );
    } catch {
      // Telemetry push is best-effort and must not break recording.
    }
  }

  async moveCursorTo(selector: string): Promise<void> {
    try {
      const wrapped = this.page as TauriPlaywrightPage & {
        resolveTextSelector?: (s: string) => Promise<string>;
      };
      const resolved = wrapped.resolveTextSelector
        ? await wrapped.resolveTextSelector(selector)
        : selector;
      await this.sweepCursor(elementCenterJs(resolved));
    } catch {
      // Cursor sweeps are cosmetic. If the capture loop starves the webview,
      // skip the animation rather than abort the recording.
    }
  }

  private async sweepCursor(targetExpression: string): Promise<void> {
    try {
      const target = await this.readCursorTarget(targetExpression);
      if (!target) return;
      await this.sweepPath(target.x, target.y);
    } catch {
      // Under heavy capture load, evaluate calls may time out.  Skip the
      // sweep animation — the click/type action will still fire at the
      // correct element via the plugin's own selector resolution.
    }
  }

  private async readCursorTarget(
    expression: string,
  ): Promise<{ x: number; y: number } | null> {
    const raw = (await this.page.evaluate(expression)) as
      | { x?: number; y?: number; w?: number; h?: number }
      | null
      | undefined;
    if (!raw || !raw.x || !raw.y) return null;
    return { x: Math.round(raw.x), y: Math.round(raw.y) };
  }

  private async sweepPath(targetX: number, targetY: number): Promise<void> {
    const start = this.cursorPos;
    const dx = targetX - start.x;
    const dy = targetY - start.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) return;

    const steps = clamp(Math.round(dist / 45), 8, 28);
    const totalMs = clamp(dist / 2.2, 320, 950);
    const perpX = -dy / dist;
    const perpY = dx / dist;
    const arcAmp =
      (Math.random() < 0.5 ? 1 : -1) *
      Math.min(46, dist * 0.1) *
      (0.6 + Math.random() * 0.8);

    for (let s = 1; s <= steps; s++) {
      const p = s / steps;
      const e = easeInOutQuad(p);
      const nx = start.x + dx * e + perpX * arcAmp * Math.sin(Math.PI * p);
      const ny = start.y + dy * e + perpY * arcAmp * Math.sin(Math.PI * p);
      const px = Math.round(nx);
      const py = Math.round(ny);
      await this.moveMouseAbsolute(px, py);
      if (this.recording) await this.pushTelemetry('move', px, py);
      this.cursorPos = { x: px, y: py };
      await sleep((totalMs / steps) * (0.7 + Math.random() * 0.6));
    }
    this.cursorPos = { x: targetX, y: targetY };
    if (this.recording) await this.pushTelemetry('move', targetX, targetY);
  }

  private async moveMouseAbsolute(x: number, y: number): Promise<void> {
    const raw = this.page as unknown as {
      mouseMove?: (x: number, y: number) => Promise<void>;
      mouse?: { move: (x: number, y: number) => Promise<void> };
    };
    if (typeof raw.mouseMove === 'function') await raw.mouseMove(x, y);
    else if (raw.mouse?.move) await raw.mouse.move(x, y);
  }

  async collectTelemetry(): Promise<CursorTelemetry> {
    const rawResult = await this.page.evaluate(() => {
      const w = window as unknown as {
        __cursorTelemetry?: Array<{
          t: number;
          x: number;
          y: number;
          type: string;
        }>;
        __cursorTelemetryTimebase?: number | null;
        __cursorTelemetryWallBase?: number | null;
      };
      return {
        events: (w.__cursorTelemetry ?? []) as Array<{
          t: number;
          x: number;
          y: number;
          type: string;
        }>,
        timebase: w.__cursorTelemetryTimebase ?? 0,
        wallBase: w.__cursorTelemetryWallBase ?? 0,
      };
    });
    const timebase = rawResult?.timebase ?? 0;
    const viewport = await this.page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    const events = (rawResult?.events ?? [])
      .map((e) => ({
        t: e.t - timebase,
        x: e.x,
        y: e.y,
        type: e.type as 'move' | 'click' | 'scroll',
      }))
      .filter((e) => e.t >= 0);
    return {
      events,
      timebaseOrigin: 0,
      wallBaseMs: rawResult?.wallBase ?? 0,
      viewport: {
        width: viewport?.width ?? 1280,
        height: viewport?.height ?? 800,
      },
    };
  }

  async screenshot(path: string): Promise<void> {
    const fn = (this.page as Record<string, unknown>)['screenshot'];
    if (typeof fn === 'function') {
      await (fn as (options: { path: string }) => Promise<void>).call(
        this.page,
        { path },
      );
    }
  }

  async close(): Promise<void> {
    const close = (this.page as Record<string, unknown>)['close'];
    if (typeof close === 'function') {
      await (close as () => Promise<void>).call(this.page);
    }
  }
}

const TELEMETRY_INIT = function (): void {
  const w = window as unknown as {
    __cursorTelemetry?: unknown[];
    __cursorLastX?: number;
    __cursorLastY?: number;
    __TP_PUSH?: (type: string, x: number, y: number) => void;
  };
  if (!w.__TP_PUSH) {
    w.__TP_PUSH = (type: string, x: number, y: number) => {
      w.__cursorLastX = x;
      w.__cursorLastY = y;
      w.__cursorTelemetry!.push({
        t: performance.now(),
        x,
        y,
        type,
      });
    };
  }
  if (!w.__cursorTelemetry) {
    w.__cursorTelemetry = [];
    const push = (type: string, e: MouseEvent | WheelEvent) => {
      w.__TP_PUSH!(type, (e as MouseEvent).clientX ?? 0, (e as MouseEvent).clientY ?? 0);
    };
    window.addEventListener('mousemove', (e: MouseEvent) => push('move', e));
    window.addEventListener('mousedown', (e: MouseEvent) => push('click', e));
    window.addEventListener('wheel', (e: WheelEvent) => push('scroll', e));
  }
};