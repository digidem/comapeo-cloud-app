import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';

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
    <Button type="button" variant="ghost" size="sm" onClick={handleCopy}>
      {copied ? successLabel : label}
    </Button>
  );
}

export type { CopyButtonProps };
