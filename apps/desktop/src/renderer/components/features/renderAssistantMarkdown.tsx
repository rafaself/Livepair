import { Fragment, type ReactNode } from 'react';

type MarkdownBlock =
  | {
      type: 'paragraph';
      lines: string[];
    }
  | {
      type: 'list';
      items: string[];
    };

function isListItemLine(line: string): boolean {
  return /^[-*] /.test(line);
}

function hasLongUnbrokenToken(content: string): boolean {
  return content.split(/\s+/).some((token) => token.length >= 32);
}

function parseBlocks(content: string): MarkdownBlock[] {
  const lines = content.split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    if (lines[index]?.trim() === '') {
      index += 1;
      continue;
    }

    if (isListItemLine(lines[index] ?? '')) {
      const items: string[] = [];

      while (index < lines.length && isListItemLine(lines[index] ?? '')) {
        items.push((lines[index] ?? '').slice(2));
        index += 1;
      }

      blocks.push({ type: 'list', items });
      continue;
    }

    const paragraphLines: string[] = [];

    while (index < lines.length) {
      const line = lines[index] ?? '';

      if (line.trim() === '') {
        break;
      }

      if (paragraphLines.length > 0 && isListItemLine(line)) {
        break;
      }

      paragraphLines.push(line);
      index += 1;
    }

    blocks.push({ type: 'paragraph', lines: paragraphLines });
  }

  return blocks;
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  match = pattern.exec(text);

  while (match) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];

    if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(<code key={`code-${match.index}`}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(<strong key={`strong-${match.index}`}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(token);
    }

    lastIndex = match.index + token.length;
    match = pattern.exec(text);
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export function renderAssistantMarkdown(content: string): JSX.Element {
  if (hasLongUnbrokenToken(content)) {
    return <p className="conversation-turn__body">{content}</p>;
  }

  const blocks = parseBlocks(content);

  return (
    <div className="conversation-turn__body">
      {blocks.map((block, index) => (
        <Fragment key={`block-${index}`}>
          {index > 0 ? '\n\n' : null}
          {block.type === 'list' ? (
            <ul>
              {block.items.map((item, itemIndex) => (
                <li key={`item-${index}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          ) : (
            <p>{block.lines.map((line, lineIndex) => (
              <Fragment key={`line-${index}-${lineIndex}`}>
                {lineIndex > 0 ? '\n' : null}
                {renderInlineMarkdown(line)}
              </Fragment>
            ))}</p>
          )}
        </Fragment>
      ))}
    </div>
  );
}
