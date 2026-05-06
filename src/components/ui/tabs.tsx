import * as TabsPrimitive from '@radix-ui/react-tabs';

import { type ReactNode } from 'react';

interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
}

interface TabsSubComponentProps {
  value: string;
  children: ReactNode;
  className?: string;
}

interface TabsListProps {
  children: ReactNode;
  className?: string;
}

function TabsRoot({ defaultValue, value, onValueChange, children }: TabsProps) {
  return (
    <TabsPrimitive.Root
      defaultValue={defaultValue}
      value={value}
      onValueChange={onValueChange}
    >
      {children}
    </TabsPrimitive.Root>
  );
}

function TabsList({ children, className = '' }: TabsListProps) {
  return (
    <TabsPrimitive.List className={`flex border-b border-border ${className}`}>
      {children}
    </TabsPrimitive.List>
  );
}

function TabsTrigger({
  value,
  children,
  className = '',
}: TabsSubComponentProps) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={`px-4 py-2 text-sm font-medium text-text-muted transition-colors data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary -mb-px outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

function TabsContent({
  value,
  children,
  className = '',
}: TabsSubComponentProps) {
  return (
    <TabsPrimitive.Content
      value={value}
      className={`pt-4 outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
    >
      {children}
    </TabsPrimitive.Content>
  );
}

const Tabs = Object.assign(TabsRoot, {
  List: TabsList,
  Trigger: TabsTrigger,
  Content: TabsContent,
});

export { Tabs };
export type { TabsProps };
