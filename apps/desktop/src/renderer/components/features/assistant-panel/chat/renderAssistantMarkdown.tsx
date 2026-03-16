import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function renderAssistantMarkdown(
  content: string,
  className = 'conversation-turn__body',
): JSX.Element {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
