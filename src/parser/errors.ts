export class ParseError extends Error {
  readonly line?: number;
  readonly column?: number;

  constructor(message: string, line?: number, column?: number) {
    super(line !== undefined ? `${message} (line ${line})` : message);
    this.name = 'ParseError';
    if (line !== undefined) this.line = line;
    if (column !== undefined) this.column = column;
  }
}
