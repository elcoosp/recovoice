import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export interface Check {
  name: string;
  ok: boolean;
  message: string;
  fix?: string;
}

export interface DoctorReport {
  checks: Check[];
  allOk: boolean;
}

export function runDoctor(): DoctorReport {
  const checks: Check[] = [];

  checks.push(checkBinary('ffmpeg', ['-version'], {
    fix: 'Install ffmpeg: brew install ffmpeg (macOS) or apt install ffmpeg (Linux)',
  }));

  checks.push(checkBinary('ffprobe', ['-version'], {
    fix: 'ffprobe ships with ffmpeg; install it alongside',
  }));

  checks.push(checkNodeModule('@napi-rs/canvas', {
    fix: 'Run: pnpm add @napi-rs/canvas',
  }));

  checks.push(checkNodeModule('@srsholmes/tauri-playwright', {
    fix: 'Run: pnpm add @srsholmes/tauri-playwright',
  }));

  checks.push(checkBinary(process.env.RECOVOICE_EDGE_TTS ?? 'edge-tts', ['--version'], {
    fix: 'Install edge-tts: pip install edge-tts (optional if using Kokoro)',
  }));

  return {
    checks,
    allOk: checks.every((c) => c.ok),
  };
}

function checkBinary(
  name: string,
  args: string[],
  hints: { fix?: string },
): Check {
  const result = spawnSync(name, args, { encoding: 'utf-8' });
  if (result.status === 0) {
    return { name, ok: true, message: `${name} is available` };
  }
  const check: Check = {
    name,
    ok: false,
    message: `${name} not found or not executable`,
  };
  if (hints.fix) check.fix = hints.fix;
  return check;
}

function checkNodeModule(name: string, hints: { fix?: string }): Check {
  try {
    import.meta.resolve(name);
    return { name, ok: true, message: `${name} is installed` };
  } catch {
    const check: Check = {
      name,
      ok: false,
      message: `${name} is not installed`,
    };
    if (hints.fix) check.fix = hints.fix;
    return check;
  }
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = ['Recovoice environment check:', ''];
  for (const c of report.checks) {
    const mark = c.ok ? '  ✓' : '  ✗';
    lines.push(`${mark} ${c.name}: ${c.message}`);
    if (!c.ok && c.fix) lines.push(`      fix: ${c.fix}`);
  }
  lines.push('');
  lines.push(
    report.allOk
      ? 'All checks passed. Recovoice is ready to run.'
      : 'Some checks failed. Fix the issues above and re-run.',
  );
  return lines.join('\n');
}

export { existsSync };
