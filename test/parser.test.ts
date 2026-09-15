import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseScript, parseScriptFromString } from '../src/parser/parser.js';
import { ParseError } from '../src/parser/errors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(__dirname, 'fixtures');
const fx = (name: string) => resolve(fixtures, name);

describe('parseScript', () => {
  describe('simple script', () => {
    it('parses frontmatter', () => {
      const script = parseScript(fx('simple.demo.md'));
      expect(script.frontmatter.viewport).toEqual({ width: 1280, height: 800 });
      expect(script.frontmatter.fps).toBe(60);
    });

    it('produces two segments with prose and actions in order', () => {
      const script = parseScript(fx('simple.demo.md'));
      expect(script.segments).toHaveLength(2);

      const [s1, s2] = script.segments;
      expect(s1!.prose).toBe('Welcome to the demo.');
      expect(s1!.actions).toHaveLength(1);
      expect(s1!.actions[0]!.name).toBe('visit');
      expect(s1!.actions[0]!.args).toEqual(['https://example.com']);

      expect(s2!.prose).toBe('Click the start button to begin.');
      expect(s2!.actions).toHaveLength(1);
      expect(s2!.actions[0]!.name).toBe('click');
      expect(s2!.actions[0]!.args).toEqual(['#start']);
    });

    it('records the file path', () => {
      const script = parseScript(fx('simple.demo.md'));
      expect(script.filePath).toBe(fx('simple.demo.md'));
    });

    it('marks segments as not silent', () => {
      const script = parseScript(fx('simple.demo.md'));
      expect(script.segments.every((s) => !s.silent)).toBe(true);
    });
  });

  describe('variable substitution', () => {
    it('substitutes variables in prose', () => {
      const script = parseScript(fx('variables.demo.md'));
      expect(script.segments[0]!.prose).toBe(
        "Welcome to Acme - let's sign in.",
      );
    });

    it('substitutes variables in action arguments', () => {
      const script = parseScript(fx('variables.demo.md'));
      const [_, s2] = script.segments;
      expect(s2!.actions[0]!.args).toEqual(['#email', 'maya@example.com']);
    });

    it('throws ParseError on unknown variable', () => {
      expect(() => parseScript(fx('unknown-variable.demo.md'))).toThrow(
        ParseError,
      );
    });
  });

  describe('caption blocks', () => {
    it('attaches a caption block to the preceding segment', () => {
      const script = parseScript(fx('caption-block.demo.md'));
      expect(script.segments).toHaveLength(2);
      expect(script.segments[0]!.captionOverride?.text).toBe(
        'Choose a format to export.',
      );
      expect(script.segments[0]!.prose).toBe('Export your data as CSV or PDF.');
      expect(script.segments[1]!.captionOverride).toBeUndefined();
    });

    it('does not include the caption block in prose', () => {
      const script = parseScript(fx('caption-block.demo.md'));
      expect(script.segments[0]!.prose).not.toContain('Choose a format');
    });
  });

  describe('inline caption override', () => {
    it('extracts {{caption: ...}} from prose and stores it', () => {
      const script = parseScript(fx('caption-inline.demo.md'));
      expect(script.segments).toHaveLength(1);
      expect(script.segments[0]!.prose).toBe('Export your data as CSV or PDF.');
      expect(script.segments[0]!.captionOverride?.text).toBe(
        'Choose a format to export.',
      );
    });
  });

  describe('no frontmatter', () => {
    it('parses body-only files', () => {
      const script = parseScript(fx('no-frontmatter.demo.md'));
      expect(script.frontmatter).toEqual({});
      expect(script.segments).toHaveLength(1);
      expect(script.segments[0]!.prose).toBe(
        'Just a plain segment with no frontmatter.',
      );
    });
  });

  describe('multi-line prose', () => {
    it('joins consecutive prose lines into one paragraph', () => {
      const script = parseScript(fx('multiparagraph.demo.md'));
      expect(script.segments).toHaveLength(2);
      expect(script.segments[0]!.prose).toBe(
        'This is the first line.\nAnd this is the second line.',
      );
      expect(script.segments[1]!.prose).toBe('Second segment starts here.');
    });
  });

  describe('action parsing', () => {
    it('parses numeric, boolean, and object arguments', () => {
      const source = [
        '`zoom(1.5, { origin: "#chart", duration: 300 })`',
        'The chart is zoomed.',
        '',
        '`wait(500)`',
        'Wait for half a second.',
      ].join('\n');

      const script = parseScriptFromString(source, '<inline>');
      expect(script.segments[0]!.actions[0]!.args[0]).toBe(1.5);
      expect(script.segments[0]!.actions[0]!.args[1]).toEqual({
        origin: '#chart',
        duration: 300,
      });
      expect(script.segments[1]!.actions[0]!.args).toEqual([500]);
    });

    it('parses no-arg actions', () => {
      const source = '`reset()`\nReset now.';
      const script = parseScriptFromString(source, '<inline>');
      expect(script.segments[0]!.actions[0]!.args).toEqual([]);
    });

    it('throws ParseError on malformed action line', () => {
      expect(() => parseScript(fx('invalid-action.demo.md'))).toThrow(
        ParseError,
      );
    });
  });

  describe('action-only trailing segment', () => {
    it('produces a silent segment when trailing actions have no prose', () => {
      const source = [
        '`click("#a")`',
        'First action.',
        '',
        '`click("#b")`',
      ].join('\n');
      const script = parseScriptFromString(source, '<inline>');
      expect(script.segments).toHaveLength(2);
      expect(script.segments[1]!.silent).toBe(true);
      expect(script.segments[1]!.prose).toBe('');
      expect(script.segments[1]!.actions[0]!.args).toEqual(['#b']);
    });
  });

  describe('error handling', () => {
    it('throws ParseError with line number for malformed action', () => {
      try {
        parseScript(fx('invalid-action.demo.md'));
        throw new Error('expected throw');
      } catch (e) {
        expect(e).toBeInstanceOf(ParseError);
        expect((e as ParseError).line).toBe(1);
      }
    });
  });
});
