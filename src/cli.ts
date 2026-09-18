#!/usr/bin/env node
import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Recovoice } from './recovoice.js';
import { createTTSProvider } from './tts/factory.js';
import { createTauriPlaywrightAdapter } from './recording/tauri-playwright-adapter.js';
import { createPolishCompositor } from './compositor/polish-compositor.js';
import { createPassthroughCompositor } from './compositor/passthrough-compositor.js';
import { resolveFFmpegPath } from './config/env.js';
import type { PolishConfig } from './types/recording.js';
import type { Script } from './types/script.js';

const pkg = { version: '0.1.0' };

const program = new Command();

program
  .name('recovoice')
  .description(
    'Produce narrated, captioned, polished demo videos from a single .demo.md file',
  )
  .version(pkg.version)
  .argument('<script>', 'Path to the .demo.md script')
  .option('-o, --output <dir>', 'Output directory', './output')
  .option('--fps <number>', 'Recording frame rate', '60')
  .option('--check', 'Validate the script only; no execution')
  .option('--dry-run', 'Show planned actions without executing')
  .option('--voiceover-only', 'Only regenerate voiceover and captions (skip recording)')
  .option('--tts <provider>', 'TTS provider (auto|mock|kokoro|edge)', 'auto')
  .option('--kokoro-url <url>', 'Kokoro server URL', 'http://localhost:8880')
  .option('--config <path>', 'Path to config file')
  .option('--confirm', 'Prompt before incurring TTS costs')
  .option('--no-polish', 'Disable all polish effects')
  .action(async (scriptPath: string, opts: Record<string, unknown>) => {
    const absoluteScript = resolve(scriptPath);
    if (!existsSync(absoluteScript)) {
      process.stderr.write(`Script not found: ${absoluteScript}\n`);
      process.exit(2);
    }

    const config = {
      configCwd: process.cwd(),
      ...(typeof opts.config === 'string' ? { configPath: opts.config } : {}),
      cliOverrides: {
        fps: Number(opts.fps),
        ...(opts.polish === false ? { polish: {} } : {}),
      },
    };

    // Pre-flight: load the merged script (frontmatter + config) so we can
    // pick the TTS provider and typing speed before wiring the session.
    const preflight = new Recovoice({
      script: absoluteScript,
      recordingAdapter: createTauriPlaywrightAdapter(),
      config,
    });
    let meta: Script | undefined;
    try {
      meta = await preflight.loadScriptMeta();
    } catch (err) {
      process.stderr.write(
        `warning: could not load script metadata (${(err as Error).message}); ` +
          'falling back to defaults\n',
      );
    }

    const ttsName = resolveProviderName(
      opts.tts,
      meta?.frontmatter.voiceover?.provider,
      'mock',
    );
    const ttsProvider =
      ttsName === 'edge'
        ? createTTSProvider({
            provider: 'edge',
            edgeBinaryPath: process.env.RECOVOICE_EDGE_TTS,
          })
        : createTTSProvider({
            provider: ttsName,
            kokoroUrl: String(opts.kokoroUrl),
          });

    const typingSpeedMs = meta?.frontmatter.typingSpeed ?? 50;
    const recordingAdapter = createTauriPlaywrightAdapter({ typingSpeedMs });

    if (opts.confirm) {
      process.stdout.write(
        `About to synthesize voiceover and record "${absoluteScript}".\n` +
          'Press Enter to continue, or Ctrl-C to abort.\n',
      );
      await new Promise<void>((resolve) => {
        process.stdin.once('data', () => resolve());
      });
    }

    const recovoice = new Recovoice({
      script: absoluteScript,
      output: String(opts.output),
      recordingAdapter,
      ttsProvider,
      kokoroUrl: String(opts.kokoroUrl),
      voiceoverOnly: Boolean(opts.voiceoverOnly),
      config,
      compositorFactory: (result) => {
        const usePolish = opts.polish !== false;
        if (!usePolish) {
          return createPassthroughCompositor({
            ffmpegPath: resolveFFmpegPath(),
          });
        }
        return createPolishCompositor({
          durationMs: result.durationMs,
          fps: Number(opts.fps),
          telemetry: result.telemetry,
          smoothingFactor: 0.3,
          usePolish,
          burn: result.burn,
          polish: (result.polish as PolishConfig | undefined),
          ffmpegPath: resolveFFmpegPath(),
        });
      },
    });

    if (opts.check) {
      const result = await recovoice.check();
      if (result.valid) {
        process.stdout.write(`Script is valid: ${absoluteScript}\n`);
        process.exit(0);
      }
      for (const err of result.errors) {
        const suffix = err.line !== undefined ? ` (line ${err.line})` : '';
        process.stderr.write(`error: ${err.message}${suffix}\n`);
      }
      process.exit(1);
    }

    if (opts.dryRun) {
      const result = await recovoice.check();
      if (!result.valid) {
        for (const err of result.errors) {
          process.stderr.write(`error: ${err.message}\n`);
        }
        process.exit(1);
      }
      process.stdout.write(`Would record and compose: ${absoluteScript}\n`);
      process.exit(0);
    }

    try {
      const result = await recovoice.run();
      process.stdout.write(`Final video: ${result.finalVideo}\n`);
      if (result.captions.srt) {
        process.stdout.write(`Captions (SRT): ${result.captions.srt}\n`);
      }
      if (result.captions.vtt) {
        process.stdout.write(`Captions (VTT): ${result.captions.vtt}\n`);
      }
      process.exit(0);
    } catch (err) {
      process.stderr.write(`error: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

program
  .command('doctor')
  .description('Check that required external tools are installed')
  .action(async () => {
    const { runDoctor, formatDoctorReport } = await import('./doctor.js');
    const report = runDoctor();
    process.stdout.write(formatDoctorReport(report) + '\n');
    process.exit(report.allOk ? 0 : 1);
  });

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`error: ${(err as Error).message}\n`);
  process.exit(1);
});

type TTSProviderName = 'mock' | 'kokoro' | 'edge';

/**
 * Resolve the effective TTS provider. `--tts auto` (the default) reads the
 * script frontmatter; an explicit flag wins over frontmatter.
 */
function resolveProviderName(
  flag: unknown,
  frontmatterProvider: string | undefined,
  fallback: TTSProviderName,
): TTSProviderName {
  const raw = String(flag ?? 'auto');
  if (raw !== 'auto') {
    if (raw === 'mock' || raw === 'kokoro' || raw === 'edge') return raw;
    throw new Error(`Invalid --tts provider: ${raw} (expected auto|mock|kokoro|edge)`);
  }
  if (frontmatterProvider === 'kokoro' || frontmatterProvider === 'edge') {
    return frontmatterProvider;
  }
  return fallback;
}
