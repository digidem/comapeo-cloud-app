import { type HTMLAttributes, type ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function Card({ children, className = '', ...rest }: CardProps) {
  return (
    <div
      className={`bg-surface-card rounded-card shadow-card border border-border/15 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

function CardHeader({ children, className = '', ...rest }: CardProps) {
  return (
    <div className={`px-5 py-4 ${className}`} {...rest}>
      {children}
    </div>
  );
}

function CardBody({ children, className = '', ...rest }: CardProps) {
  return (
    <div className={`px-5 py-4 ${className}`} {...rest}>
      {children}
    </div>
  );
}

function CardFooter({ children, className = '', ...rest }: CardProps) {
  return (
    <div className={`px-5 py-4 ${className}`} {...rest}>
      {children}
    </div>
  );
}

Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;

export { Card };
export type { CardProps };
