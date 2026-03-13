import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function renderAssistantMarkdown(content: string): JSX.Element {
  return (
    <div className="conversation-turn__body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
