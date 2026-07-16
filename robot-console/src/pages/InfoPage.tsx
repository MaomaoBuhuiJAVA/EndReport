import Markdown from 'react-markdown';

interface InfoPageProps {
  eyebrow: string;
  title: string;
  summary: string;
  content: string;
}

export function InfoPage({ eyebrow, title, summary, content }: InfoPageProps) {
  return (
    <main className="info-page">
      <section className="info-page__header">
        <div className="page-shell">
          <p className="eyebrow eyebrow--dark">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{summary}</p>
        </div>
      </section>
      <section className="page-shell info-page__body">
        <article className="markdown-content">
          <Markdown urlTransform={(url) => url}>{content}</Markdown>
        </article>
      </section>
    </main>
  );
}
