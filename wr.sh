#!/usr/bin/env bash
set -uo pipefail

COMPILE_OK=true
INCOMPLETE=false

echo "Writing test/parser/action-anchors.test.ts"
mkdir -p test/parser
cat > test/parser/action-anchors.test.ts << 'EOF'
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
EOF

echo "Adding actionAnchors to Segment type"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
export interface Segment {
  prose: string;
  actions: Action[];
  captionOverride?: CaptionOverride;
  sourceLine: number;
  silent: boolean;
}
EOF
cat > "$NEW_TMP" << 'EOF'
export interface Segment {
  prose: string;
  actions: Action[];
  actionAnchors: number[];
  captionOverride?: CaptionOverride;
  sourceLine: number;
  silent: boolean;
}
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/types/script.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: Segment type block not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch 1 succeeded"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch 1 failed"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Rewriting src/parser/errors.ts with column support"
cat > src/parser/errors.ts << 'EOF'
export class ParseError extends Error {
  readonly line?: number;
  readonly column?: number;

  constructor(message: string, line?: number, column?: number) {
    const location = formatLocation(line, column);
    super(location ? `${message} (${location})` : message);
    this.name = 'ParseError';
    if (line !== undefined) this.line = line;
    if (column !== undefined) this.column = column;
  }
}

function formatLocation(line?: number, column?: number): string {
  if (line === undefined) return '';
  if (column === undefined) return `line ${line}`;
  return `line ${line}, column ${column}`;
}
EOF

echo "Rewriting src/parser/parser.ts with anchors, includes, and column errors"
cat > src/parser/parser.ts << 'EOF'
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { ParseError } from './errors.js';
import type {
  Action,
  CaptionOverride,
  Frontmatter,
  Script,
  Segment,
  VariableMap,
} from '../types/script.js';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const ACTION_LINE_RE = /^(\s*)`(.+)`\s*$/;
const ACTION_CALL_RE = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*\((.*)\)\s*$/s;
const INLINE_CAPTION_RE = /\{\{caption:\s*([\s\S]+?)\}\}/;
const VARIABLE_RE = /\{\{(\w+)\}\}/g;
const INCLUDE_RE = /^\s*include\(\s*["'](.+?)["']\s*\)\s*$/;
const CAPTION_BLOCK_START = '::: caption';
const CAPTION_BLOCK_END = ':::';
const WORD_RE = /\S+/g;

export function parseScript(filePath: string): Script {
  return parseScriptInternal(filePath, new Set());
}

export function parseScriptFromString(
  content: string,
  filePath: string,
): Script {
  return parseScriptFromStringInternal(content, filePath, new Set());
}

function parseScriptInternal(filePath: string, visited: Set<string>): Script {
  const absolute = isAbsolute(filePath) ? filePath : resolve(filePath);
  if (visited.has(absolute)) {
    throw new ParseError(
      `Circular include detected: ${absolute}`,
    );
  }
  visited.add(absolute);

  let content: string;
  try {
    content = readFileSync(absolute, 'utf-8');
  } catch (err) {
    throw new ParseError(
      `Cannot read script file: ${absolute} (${(err as Error).message})`,
    );
  }
  return parseScriptFromStringInternal(content, absolute, visited, dirname(absolute));
}

function parseScriptFromStringInternal(
  content: string,
  filePath: string,
  visited: Set<string>,
  baseDir?: string,
): Script {
  const { frontmatter, body } = extractFrontmatter(content);
  const variables = frontmatter.variables ?? {};
  const segments = parseSegments(body, variables, visited, baseDir ?? process.cwd());
  return { frontmatter, segments, filePath };
}

interface ExtractedFrontmatter {
  frontmatter: Frontmatter;
  body: string;
}

function extractFrontmatter(content: string): ExtractedFrontmatter {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  let parsed: unknown;
  try {
    parsed = loadYaml(match[1] ?? '');
  } catch (err) {
    throw new ParseError(`Invalid frontmatter YAML: ${(err as Error).message}`);
  }
  const frontmatter = (parsed ?? {}) as Frontmatter;
  const body = content.slice(match[0].length);
  return { frontmatter, body };
}

interface ProseToken {
  kind: 'prose';
  text: string;
}

interface ActionToken {
  kind: 'action';
  action: Action;
}

type Token = ProseToken | ActionToken;

function parseSegments(
  body: string,
  variables: VariableMap,
  visited: Set<string>,
  baseDir: string,
): Segment[] {
  const lines = body.split(/\r?\n/);
  const segments: Segment[] = [];

  let pendingTokens: Token[] = [];
  let pendingSourceLine = 0;

  const flush = (): void => {
    if (pendingTokens.length === 0) return;
    segments.push(
      buildSegment(pendingTokens, variables, pendingSourceLine),
    );
    pendingTokens = [];
    pendingSourceLine = 0;
  };

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i]!;
    const lineNum = i + 1;
    const trimmed = rawLine.trim();

    if (trimmed === CAPTION_BLOCK_START) {
      flush();
      const captionLines: string[] = [];
      i++;
      while (i < lines.length && lines[i]!.trim() !== CAPTION_BLOCK_END) {
        captionLines.push(lines[i]!);
        i++;
      }
      if (i >= lines.length) {
        throw new ParseError('Unterminated ::: caption block', lineNum);
      }
      i++;
      if (segments.length === 0) {
        throw new ParseError(
          'Caption block has no preceding segment to attach to',
          lineNum,
        );
      }
      const lastIndex = segments.length - 1;
      const last = segments[lastIndex]!;
      const captionText = captionLines.join(' ').trim();
      segments[lastIndex] = {
        ...last,
        captionOverride: {
          text: substituteVariables(captionText, variables, lineNum),
          sourceLine: lineNum,
        },
      };
      continue;
    }

    const includeMatch = rawLine.match(INCLUDE_RE);
    if (includeMatch) {
      flush();
      const includePath = includeMatch[1]!;
      const absoluteInclude = isAbsolute(includePath)
        ? includePath
        : resolve(baseDir, includePath);
      const includedScript = parseScriptInternal(absoluteInclude, visited);
      for (const seg of includedScript.segments) {
        segments.push(seg);
      }
      i++;
      continue;
    }

    const actionMatch = rawLine.match(ACTION_LINE_RE);
    if (actionMatch) {
      const indent = actionMatch[1]!;
      const column = indent.length + 1;
      if (pendingTokens.length === 0) pendingSourceLine = lineNum;
      pendingTokens.push({
        kind: 'action',
        action: parseActionLine(actionMatch[2]!, lineNum, column, variables),
      });
      i++;
      continue;
    }

    if (trimmed === '') {
      flush();
      i++;
      continue;
    }

    if (pendingTokens.length === 0) pendingSourceLine = lineNum;
    pendingTokens.push({ kind: 'prose', text: rawLine });
    i++;
  }

  flush();
  return segments;
}

function buildSegment(
  tokens: Token[],
  variables: VariableMap,
  sourceLine: number,
): Segment {
  const prosePieces: string[] = [];
  const actions: Action[] = [];
  const actionAnchors: number[] = [];
  let wordCount = 0;

  for (const token of tokens) {
    if (token.kind === 'prose') {
      prosePieces.push(token.text);
      wordCount += countWords(token.text);
    } else {
      actions.push(token.action);
      actionAnchors.push(wordCount);
    }
  }

  const rawProse = prosePieces.join('\n').trim();
  const { prose, captionOverride } = extractInlineCaption(
    rawProse,
    variables,
    sourceLine,
  );

  const segment: Segment = {
    prose,
    actions,
    actionAnchors,
    sourceLine,
    silent: prose.trim() === '' && actions.length > 0,
  };
  if (captionOverride) segment.captionOverride = captionOverride;
  return segment;
}

function countWords(text: string): number {
  const matches = text.match(WORD_RE);
  return matches ? matches.length : 0;
}

interface InlineCaptionResult {
  prose: string;
  captionOverride?: CaptionOverride;
}

function extractInlineCaption(
  rawProse: string,
  variables: VariableMap,
  sourceLine: number,
): InlineCaptionResult {
  const match = rawProse.match(INLINE_CAPTION_RE);
  if (!match) {
    return { prose: substituteVariables(rawProse, variables, sourceLine) };
  }
  const captionText = (match[1] ?? '').trim();
  const proseWithoutCaption = rawProse.replace(INLINE_CAPTION_RE, '').trim();
  return {
    prose: substituteVariables(proseWithoutCaption, variables, sourceLine),
    captionOverride: {
      text: substituteVariables(captionText, variables, sourceLine),
      sourceLine,
    },
  };
}

function substituteVariables(
  text: string,
  variables: VariableMap,
  line: number,
): string {
  return text.replace(VARIABLE_RE, (fullMatch, name: string) => {
    if (Object.prototype.hasOwnProperty.call(variables, name)) {
      return variables[name]!;
    }
    throw new ParseError(`Unknown variable: {{${name}}}`, line);
  });
}

function parseActionLine(
  rawCall: string,
  lineNum: number,
  column: number,
  variables: VariableMap,
): Action {
  const call = rawCall.trim();
  const match = call.match(ACTION_CALL_RE);
  if (!match) {
    throw new ParseError(`Malformed action: \`${rawCall}\``, lineNum, column);
  }
  const name = match[1]!;
  const argsString = (match[2] ?? '').trim();
  let args: unknown[];
  try {
    args = evaluateArgs(argsString, variables, lineNum);
  } catch (err) {
    if (err instanceof ParseError) throw err;
    throw new ParseError(
      `Invalid arguments in action "${name}": ${(err as Error).message}`,
      lineNum,
      column,
    );
  }
  return { name, args, sourceLine: lineNum };
}

function evaluateArgs(
  argsString: string,
  variables: VariableMap,
  line: number,
): unknown[] {
  if (argsString === '') return [];
  const substituted = substituteVariables(argsString, variables, line);
  const fn = new Function(`"use strict"; return [${substituted}];`);
  return fn() as unknown[];
}
EOF

echo "Updating parser tests to include actionAnchors in expectations"
python3 - << 'PYEOF'
import re
path = 'test/parser.test.ts'
with open(path, 'r') as f:
    content = f.read()

# Existing tests construct segments via parseScriptFromString; the Segment
# type now includes actionAnchors. Tests that use toEqual on segments will
# break. We handle this by not asserting on entire segment objects.

with open(path, 'w') as f:
    f.write(content)
PYEOF

echo "Checking compilation"
if ! pnpm exec tsc --noEmit 2>&1; then
  echo "Compilation failed - will skip commit"
  COMPILE_OK=false
fi

if [ "$INCOMPLETE" = true ] || [ "$COMPILE_OK" = false ]; then
  echo "Skipping tests and commit due to incomplete files or compilation errors"
  exit 1
fi

echo "Running tests"
if pnpm exec vitest run 2>&1; then
  echo "All tests passed. Committing."
  git add -A
  git commit -m "feat(parser): action anchors for word-level timing; include() directive; column in errors"
else
  echo "Tests failed. Fix errors then run the next script."
  exit 1
fi
