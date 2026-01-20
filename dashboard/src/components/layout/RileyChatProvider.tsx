'use client';

import { usePathname } from 'next/navigation';
import { RileyChatWidget } from '../RileyChatWidget';

export function RileyChatProvider() {
  const pathname = usePathname();

  // Map pathname to human-readable page name
  const getPageName = (path: string): string => {
    if (path === '/') return 'Dashboard Home';
    if (path.startsWith('/sourcing')) return 'Sourcing Page';
    if (path.startsWith('/candidates')) return 'Candidates Pipeline';
    if (path.startsWith('/approvals')) return 'Approval Queue';
    if (path.startsWith('/settings')) return 'Settings';
    if (path.startsWith('/guidelines')) return 'Guidelines Editor';
    if (path.startsWith('/criteria')) return 'Criteria Editor';
    return path;
  };

  return <RileyChatWidget currentPage={getPageName(pathname)} />;
}
