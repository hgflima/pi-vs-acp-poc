import ShikiHighlighter from "react-shiki";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/client/lib/cn";

interface CodeBlockProps {
  language: string;
  children: string;
}

export function CodeBlock({ language, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative my-4 rounded-lg overflow-hidden">
      {/* Language label */}
      <div className="flex items-center justify-between bg-zinc-800 px-4 py-1.5 text-xs text-zinc-400">
        <span>{language}</span>
        <button
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
            "text-zinc-400 hover:text-zinc-200"
          )}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <ShikiHighlighter
        language={language}
        theme="github-dark"
        delay={100}
        addDefaultStyles={true}
      >
        {children}
      </ShikiHighlighter>
    </div>
  );
}
