'use client';

import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import styles from './app-shell.module.css';

const components = {
  a: ({ children, node: _node, ...props }) => (
    <a {...props} rel="noreferrer noopener" target="_blank">
      {children}
    </a>
  ),
  table: ({ node: _node, ...props }) => (
    <div className={styles.markdownTable}>
      <table {...props} />
    </div>
  ),
} satisfies Components;

export function ChatMarkdown({ children }: { readonly children: string }) {
  return (
    <div className={styles.markdown}>
      <Markdown components={components} remarkPlugins={[remarkGfm]} skipHtml>
        {children}
      </Markdown>
    </div>
  );
}
