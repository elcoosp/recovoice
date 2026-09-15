import { readFileSync } from 'node:fs';
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
const ACTION_LINE_RE = /^\s*`(.+)`\s*$/;
const ACTION_CALL_RE = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*\((.*)\)\s*$/s;
const INLINE_CAPTION_RE = /\{\{caption:\s*([\s\S]+?)\}\}/;
const VARIABLE_RE = /\{\{(\w+)\}\}/g;
const CAPTION_BLOCK_START = '::: caption';
const CAPTION_BLOCK_END = ':::';

export function parseScript(filePath: string): Script {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new ParseError(
      `Cannot read script file: ${filePath} (${(err as Error).message})`,
    );
  }
  return parseScriptFromString(content, filePath);
}

export function parseScriptFromString(
  content: string,
  filePath: string,
): Script {
  const { frontmatter, body } = extractFrontmatter(content);
  const variables = frontmatter.variables ?? {};
  const segments = parseSegments(body, variables);
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
    throw new ParseError(
      `Invalid frontmatter YAML: ${(err as Error).message}`,
    );
  }
  const frontmatter = (parsed ?? {}) as Frontmatter;
  const body = content.slice(match[0].length);
  return { frontmatter, body };
}

function parseSegments(body: string, variables: VariableMap): Segment[] {
  const lines = body.split(/\r?\n/);
  const segments: Segment[] = [];

  let pendingActions: Action[] = [];
  let pendingProse: string[] = [];
  let pendingSourceLine = 0;

  const flush = (): void => {
    if (pendingProse.length === 0 && pendingActions.length === 0) return;
    segments.push(
      buildSegment(
        pendingActions,
        pendingProse,
        variables,
        pendingSourceLine,
      ),
    );
    pendingActions = [];
    pendingProse = [];
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
      i++; // consume closing :::

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

    const actionMatch = rawLine.match(ACTION_LINE_RE);
    if (actionMatch) {
      if (pendingActions.length === 0 && pendingProse.length === 0) {
        pendingSourceLine = lineNum;
      }
      pendingActions.push(
        parseActionLine(actionMatch[1]!, lineNum, variables),
      );
      i++;
      continue;
    }

    if (trimmed === '') {
      flush();
      i++;
      continue;
    }

    if (pendingProse.length === 0 && pendingActions.length === 0) {
      pendingSourceLine = lineNum;
    }
    pendingProse.push(rawLine);
    i++;
  }

  flush();
  return segments;
}

function buildSegment(
  actions: Action[],
  proseLines: string[],
  variables: VariableMap,
  sourceLine: number,
): Segment {
  const rawProse = proseLines.join('\n').trim();
  const { prose, captionOverride } = extractInlineCaption(
    rawProse,
    variables,
    sourceLine,
  );
  const segment: Segment = {
    prose,
    actions,
    sourceLine,
    silent: prose.trim() === '' && actions.length > 0,
  };
  if (captionOverride) segment.captionOverride = captionOverride;
  return segment;
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
    return {
      prose: substituteVariables(rawProse, variables, sourceLine),
    };
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
  variables: VariableMap,
): Action {
  const call = rawCall.trim();
  const match = call.match(ACTION_CALL_RE);
  if (!match) {
    throw new ParseError(`Malformed action: \`${rawCall}\``, lineNum);
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
