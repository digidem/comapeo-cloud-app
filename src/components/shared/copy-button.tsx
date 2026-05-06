import { useCallback, useState } from 'react';

interface CopyButtonProps {
  text: string;
  label?: string;
  successLabel?: string;
}

export function CopyButton({
  text,
  label = 'Copy',
  successLabel = 'Copied!',
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button type="button" onClick={handleCopy}>
      {copied ? successLabel : label}
    </button>
  );
}

export type { CopyButtonProps };
