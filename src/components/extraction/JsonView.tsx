import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";

export function JsonView({ value }: { value: unknown }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(value, null, 2);
  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-7 w-7 z-10"
        onClick={async () => {
          if (!(await copyText(text))) return;
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
      <pre className="font-mono text-xs leading-relaxed bg-muted/50 rounded-lg p-4 overflow-auto max-h-[60vh] border">
        <code dangerouslySetInnerHTML={{ __html: highlight(text) }} />
      </pre>
    </div>
  );
}

function escape(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

function highlight(json: string) {
  // tokenize a bit
  return escape(json)
    .replace(/(&quot;[^&]*?&quot;)(\s*:)/g, '<span style="color:#4f46e5">$1</span>$2')
    .replace(/: (&quot;[^&]*?&quot;)/g, ': <span style="color:#059669">$1</span>')
    .replace(/\b(true|false|null)\b/g, '<span style="color:#d97706">$1</span>')
    .replace(/\b(-?\d+\.?\d*)\b/g, '<span style="color:#0891b2">$1</span>');
}
