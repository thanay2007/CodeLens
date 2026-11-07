"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("json", json);

export function CodeBlock({
  code,
  language = "typescript",
}: {
  code: string;
  language?: string;
}) {
  return (
    <SyntaxHighlighter
      language={language}
      style={oneDark}
      showLineNumbers
      customStyle={{
        margin: 0,
        background: "#0d0d12",
        fontSize: 12,
        lineHeight: 1.9,
        padding: "22px 16px",
        borderRadius: 0,
      }}
      lineNumberStyle={{
        color: "#45454f",
        minWidth: "2.5em",
        paddingRight: "1.5em",
      }}
    >
      {code}
    </SyntaxHighlighter>
  );
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => (
            <div className="my-5 overflow-x-auto rounded-lg border border-white/8">
              {children}
            </div>
          ),
          code({ className, children, ...props }) {
            const language = /language-(\w+)/.exec(className || "")?.[1];
            return language ? (
              <CodeBlock
                code={String(children).replace(/\n$/, "")}
                language={language}
              />
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
