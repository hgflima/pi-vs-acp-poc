import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./code-block";
import { cn } from "@/client/lib/cn";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none",
        "prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent",
        "prose-code:before:content-none prose-code:after:content-none"
      )}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Route fenced code blocks to ShikiHighlighter
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            // No language class = inline code
            if (!match) {
              return (
                <code
                  className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <CodeBlock language={match[1]}>
                {String(children).replace(/\n$/, "")}
              </CodeBlock>
            );
          },
          // Strip default <pre> wrapper -- CodeBlock handles its own container
          pre({ children }) {
            return <>{children}</>;
          },
          // Style links
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-4 hover:text-primary/80"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
