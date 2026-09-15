import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { ParseError } from './errors.js';
import { validateFrontmatter } from './schema.js';
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
  const validation = validateFrontmatter(frontmatter);
  if (!validation.valid) {
    const issue = validation.issues[0]!;
    throw new ParseError(
      `Invalid frontmatter at "${issue.path}": ${issue.message}`,
    );
  }
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
