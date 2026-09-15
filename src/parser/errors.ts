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
