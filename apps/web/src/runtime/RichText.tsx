// Renders the assistant's short replies: line breaks, "- " bullets and **bold**. Everything else
// stays plain text (no HTML is ever injected).
import { Fragment } from 'react';

export function RichText({ text }: { text: string }) {
  const lines = String(text || '').split('\n');
  return (
    <span>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && '\n'}
          {inline(line.replace(/^\s*[-*]\s+/, '• ').replace(/^#{1,4}\s+/, ''))}
        </Fragment>
      ))}
    </span>
  );
}

function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.length > 4 && part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part.replace(/\*\*/g, ''),
  );
}
