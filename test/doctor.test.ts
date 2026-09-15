import { describe, it, expect } from 'vitest';
import { runDoctor, formatDoctorReport } from '../src/doctor.js';

describe('runDoctor', () => {
  it('returns a report with checks', () => {
    const report = runDoctor();
    expect(report.checks.length).toBeGreaterThan(0);
    for (const c of report.checks) {
      expect(typeof c.name).toBe('string');
      expect(typeof c.ok).toBe('boolean');
      expect(typeof c.message).toBe('string');
    }
  });

  it('allOk matches the AND of all checks', () => {
    const report = runDoctor();
    const expected = report.checks.every((c) => c.ok);
    expect(report.allOk).toBe(expected);
  });
});

describe('formatDoctorReport', () => {
  it('renders check names and status markers', () => {
    const text = formatDoctorReport({
      allOk: false,
      checks: [
        { name: 'ffmpeg', ok: true, message: 'ok' },
        {
          name: 'kokoro',
          ok: false,
          message: 'not found',
          fix: 'install it',
        },
      ],
    });
    expect(text).toContain('✓ ffmpeg');
    expect(text).toContain('✗ kokoro');
    expect(text).toContain('fix: install it');
  });

  it('reports all clear when every check passes', () => {
    const text = formatDoctorReport({
      allOk: true,
      checks: [{ name: 'ffmpeg', ok: true, message: 'ok' }],
    });
    expect(text).toContain('All checks passed');
  });
});
