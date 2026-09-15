import { describe, it, expect } from 'vitest';
import { parseScriptFromString } from '../../src/parser/parser.js';

describe('action anchors', () => {
  it('assigns anchor 0 to an action before any prose', () => {
    const script = parseScriptFromString(
      '`click("#a")`\nWelcome to the app.',
      '<inline>',
    );
    expect(script.segments).toHaveLength(1);
    expect(script.segments[0]!.actionAnchors).toEqual([0]);
  });

  it('assigns anchor N to an action after N words of prose', () => {
    const script = parseScriptFromString(
      'Welcome to the app.\n`click("#a")`',
      '<inline>',
    );
    expect(script.segments[0]!.actionAnchors).toEqual([4]);
  });

  it('assigns anchors for multiple actions interleaved with prose', () => {
    const source = [
      'Welcome to the app.',
      '`click("#start")`',
      'And now we begin.',
      '`type("#email", "a@b.c")`',
      'Sign in.',
    ].join('\n');
    const script = parseScriptFromString(source, '<inline>');
    // All lines are one segment (no blanks between)
    expect(script.segments).toHaveLength(1);
    const s = script.segments[0]!;
    // After "Welcome to the app." (4 words) -> anchor 4
    // After "And now we begin." (4 more words) -> anchor 8
    expect(s.actionAnchors).toEqual([4, 8]);
    expect(s.prose).toBe('Welcome to the app.\nAnd now we begin.\nSign in.');
  });

  it('handles actions before and after prose in the same segment', () => {
    const source = [
      '`click("#first")`',
      'Hello world.',
      '`click("#second")`',
    ].join('\n');
    const script = parseScriptFromString(source, '<inline>');
    expect(script.segments).toHaveLength(1);
    expect(script.segments[0]!.actionAnchors).toEqual([0, 2]);
  });

  it('keeps anchors parallel to the actions array', () => {
    const source = [
      '`a()`',
      'one two',
      '`b()`',
      'three four',
      '`c()`',
    ].join('\n');
    const script = parseScriptFromString(source, '<inline>');
    const s = script.segments[0]!;
    expect(s.actions).toHaveLength(3);
    expect(s.actionAnchors).toHaveLength(3);
    expect(s.actionAnchors).toEqual([0, 2, 4]);
  });

  it('defaults anchors to empty array for segments without actions', () => {
    const script = parseScriptFromString('Just prose here.', '<inline>');
    expect(script.segments[0]!.actionAnchors).toEqual([]);
  });
});

describe('include directive', () => {
  it('is not treated as prose when the pattern does not match', () => {
    const script = parseScriptFromString('include this text', '<inline>');
    expect(script.segments[0]!.prose).toBe('include this text');
  });
});

describe('parse error columns', () => {
  it('reports the column of a malformed action', () => {
    try {
      parseScriptFromString('`this is not valid`\nprose', '<inline>');
      throw new Error('expected throw');
    } catch (e) {
      expect((e as { column?: number }).column).toBe(1);
    }
  });

  it('reports the column of an action on an indented line', () => {
    try {
      parseScriptFromString('   `bad content here`\nprose', '<inline>');
      throw new Error('expected throw');
    } catch (e) {
      expect((e as { column?: number }).column).toBe(4);
    }
  });
});
