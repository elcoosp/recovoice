#!/usr/bin/env node
import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Recovoice } from './recovoice.js';
import { createTTSProvider } from './tts/factory.js';
import { createTauriPlaywrightAdapter } from './recording/tauri-playwright-adapter.js';
import { createPolishCompositor } from './compositor/polish-compositor.js';

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
  .option('--tts <provider>', 'TTS provider (mock|kokoro|edge)', 'kokoro')
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

    const ttsProvider = createTTSProvider({
      provider: opts.tts as 'mock' | 'kokoro' | 'edge',
      kokoroUrl: String(opts.kokoroUrl),
    });

    const recordingAdapter = createTauriPlaywrightAdapter();

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
      voiceoverOnly: Boolean(opts.voiceoverOnly),
      config: {
        configCwd: process.cwd(),
        ...(typeof opts.config === 'string' ? { configPath: opts.config } : {}),
        cliOverrides: {
          fps: Number(opts.fps),
          ...(opts.polish === false ? { polish: {} } : {}),
        },
      },
      compositorFactory: (result) =>
        createPolishCompositor({
          durationMs: result.durationMs,
          fps: Number(opts.fps),
          telemetry: result.telemetry,
          smoothingFactor: 0.3,
          usePolish: opts.polish !== false,
        }),
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
