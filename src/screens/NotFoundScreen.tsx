import { defineMessages, useIntl } from 'react-intl';

import { Link } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';

const messages = defineMessages({
  title: {
    id: 'notFound.title',
    defaultMessage: 'Page not found',
  },
  description: {
    id: 'notFound.description',
    defaultMessage:
      'The page you are looking for does not exist or has been moved.',
  },
  goHome: {
    id: 'notFound.goHome',
    defaultMessage: 'Go to Home',
  },
});

export function NotFoundScreen() {
  const intl = useIntl();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-12 text-center">
      <h1 className="text-6xl font-bold text-text-muted">404</h1>
      <h2 className="text-xl font-semibold text-text">
        {intl.formatMessage(messages.title)}
      </h2>
      <p className="text-text-muted text-sm max-w-md">
        {intl.formatMessage(messages.description)}
      </p>
      <Link to="/">
        <Button variant="primary">{intl.formatMessage(messages.goHome)}</Button>
      </Link>
    </div>
  );
}
