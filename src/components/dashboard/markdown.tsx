"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import csharp from "react-syntax-highlighter/dist/esm/languages/prism/csharp";
import docker from "react-syntax-highlighter/dist/esm/languages/prism/docker";
import toml from "react-syntax-highlighter/dist/esm/languages/prism/toml";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

const grammars = {
  markup,
  css,
  javascript,
  jsx,
  typescript,
  tsx,
  python,
  bash,
  json,
  yaml,
  sql,
  markdown,
  go,
  rust,
  java,
  cpp,
  csharp,
  docker,
  toml,
};
for (const [name, grammar] of Object.entries(grammars))
  SyntaxHighlighter.registerLanguage(name, grammar);

const theme = {
  ...vscDarkPlus,
  keyword: { color: "#c586c0" },
  builtin: { color: "#4ec9b0" },
  "class-name": { color: "#4ec9b0" },
  "language-python": { color: "#d4d4d4" },
};
const aliases: Record<string, string> = {
  ts: "typescript",
  js: "javascript",
  py: "python",
  sh: "bash",
  yml: "yaml",
  html: "markup",
  xml: "markup",
  svg: "markup",
  md: "markdown",
};

export function CodeBlock({
  code,
  language = "typescript",
  startLine = 1,
}: {
  code: string;
  language?: string;
  startLine?: number;
}) {
  return (
    <SyntaxHighlighter
      language={aliases[language] ?? language}
      style={theme}
      showLineNumbers
      startingLineNumber={startLine}
      codeTagProps={{
        style: {
          fontFamily: "Consolas, 'Courier New', monospace",
          background: "transparent",
        },
      }}
      customStyle={{
        margin: 0,
        background: "#1e1e1e",
        fontFamily: "Consolas, 'Courier New', monospace",
        fontSize: 13,
        lineHeight: 1.65,
        padding: "22px 16px",
        borderRadius: 0,
      }}
      lineNumberStyle={{
        color: "#858585",
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
        disallowedElements={["img"]}
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
