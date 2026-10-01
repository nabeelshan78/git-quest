/**
 * Command-line tokenizer: splits a typed line into tokens, handling
 * single quotes, double quotes, backslash escapes, redirections and
 * semicolons for command chaining.
 */

export interface Token {
  /** The unquoted/unescaped text of this token. */
  value: string;
  kind: 'word' | 'redirect-out' | 'redirect-append' | 'pipe' | 'semicolon' | 'and' | 'or';
}

export interface TokenizeResult {
  tokens: Token[];
  /** Non-empty when quoting is unbalanced. */
  error?: string;
}

/**
 * Tokenize a shell command line.
 *
 * Supported:
 * - Single quotes: preserve literal text, no escapes.
 * - Double quotes: backslash escapes \\, \", \$, \`, \n.
 * - Backslash outside quotes: escapes the next character.
 * - `>` → redirect-out, `>>` → redirect-append
 * - `|` → pipe token (caller should reject)
 * - `;` → semicolon (command separator)
 * - `&&` → and, `||` → or (caller should reject or handle)
 */
export function tokenize(line: string): TokenizeResult {
  const tokens: Token[] = [];
  let current = '';
  let i = 0;
  let inWord = false;

  function pushWord() {
    if (inWord) {
      tokens.push({ value: current, kind: 'word' });
      current = '';
      inWord = false;
    }
  }

  while (i < line.length) {
    const ch = line[i];

    // Single-quoted string
    if (ch === "'") {
      inWord = true;
      i++;
      while (i < line.length && line[i] !== "'") {
        current += line[i];
        i++;
      }
      if (i >= line.length) {
        return { tokens, error: 'Unterminated single quote' };
      }
      i++; // skip closing '
      continue;
    }

    // Double-quoted string
    if (ch === '"') {
      inWord = true;
      i++;
      while (i < line.length && line[i] !== '"') {
        if (line[i] === '\\' && i + 1 < line.length) {
          const next = line[i + 1];
          if (next === '\\' || next === '"' || next === '$' || next === '`') {
            current += next;
            i += 2;
            continue;
          }
          if (next === 'n') {
            current += '\n';
            i += 2;
            continue;
          }
          if (next === 't') {
            current += '\t';
            i += 2;
            continue;
          }
        }
        current += line[i];
        i++;
      }
      if (i >= line.length) {
        return { tokens, error: 'Unterminated double quote' };
      }
      i++; // skip closing "
      continue;
    }

    // Backslash outside quotes
    if (ch === '\\') {
      inWord = true;
      if (i + 1 < line.length) {
        current += line[i + 1];
        i += 2;
      } else {
        // trailing backslash — treat as literal
        current += '\\';
        i++;
      }
      continue;
    }

    // Redirect >>
    if (ch === '>' && i + 1 < line.length && line[i + 1] === '>') {
      pushWord();
      tokens.push({ value: '>>', kind: 'redirect-append' });
      i += 2;
      continue;
    }

    // Redirect >
    if (ch === '>') {
      pushWord();
      tokens.push({ value: '>', kind: 'redirect-out' });
      i++;
      continue;
    }

    // Pipe
    if (ch === '|' && (i + 1 >= line.length || line[i + 1] !== '|')) {
      pushWord();
      tokens.push({ value: '|', kind: 'pipe' });
      i++;
      continue;
    }

    // ||
    if (ch === '|' && i + 1 < line.length && line[i + 1] === '|') {
      pushWord();
      tokens.push({ value: '||', kind: 'or' });
      i += 2;
      continue;
    }

    // &&
    if (ch === '&' && i + 1 < line.length && line[i + 1] === '&') {
      pushWord();
      tokens.push({ value: '&&', kind: 'and' });
      i += 2;
      continue;
    }

    // Semicolon
    if (ch === ';') {
      pushWord();
      tokens.push({ value: ';', kind: 'semicolon' });
      i++;
      continue;
    }

    // Whitespace
    if (ch === ' ' || ch === '\t') {
      pushWord();
      i++;
      continue;
    }

    // Regular character
    inWord = true;
    current += ch;
    i++;
  }

  pushWord();
  return { tokens };
}

/** Simple helper: extract just the string values of word tokens from a line. */
export function tokenizeWords(line: string): string[] {
  const { tokens } = tokenize(line);
  return tokens.filter((t) => t.kind === 'word').map((t) => t.value);
}
