'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CheckSquare,
  FileText,
  Target,
  Building2,
  Settings,
  Users,
  BarChart3,
  Search,
  MessageSquare,
  Brain,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Approval Queue', href: '/queue', icon: CheckSquare },
  { name: 'Sourcing', href: '/sourcing', icon: Search },
  { name: 'Conversations', href: '/conversations', icon: MessageSquare },
  { name: 'Guidelines', href: '/guidelines', icon: FileText },
  { name: 'Criteria', href: '/criteria', icon: Target },
  { name: 'Tenants', href: '/tenants', icon: Building2 },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Team', href: '/team', icon: Users },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [hasAiKey, setHasAiKey] = useState<boolean | null>(null);

  // Check for AI key on mount and when storage changes
  useEffect(() => {
    const checkKey = () => {
      const key = localStorage.getItem('riley_anthropic_api_key');
      setHasAiKey(!!key);
    };

    checkKey();

    // Listen for storage changes
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'riley_anthropic_api_key') {
        checkKey();
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return (
    <div className="flex h-full w-64 flex-col bg-gray-900">
      {/* Logo */}
      <div className="flex h-16 items-center px-6">
        <span className="text-xl font-bold text-white">Riley</span>
        <span className="ml-2 rounded bg-blue-600 px-2 py-0.5 text-xs text-white">
          Teleoperator
        </span>
      </div>

      {/* AI Status */}
      {hasAiKey !== null && (
        <Link
          href="/settings"
          className={cn(
            'mx-3 mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors',
            hasAiKey
              ? 'bg-green-900/50 text-green-400 hover:bg-green-900/70'
              : 'bg-yellow-900/50 text-yellow-400 hover:bg-yellow-900/70'
          )}
        >
          {hasAiKey ? (
            <>
              <Brain className="h-4 w-4" />
              <span>AI Active</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4" />
              <span>Configure AI</span>
            </>
          )}
        </Link>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}
            >
              <item.icon
                className={cn(
                  'mr-3 h-5 w-5 flex-shrink-0',
                  isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'
                )}
              />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-gray-800 p-4">
        <div className="flex items-center">
          <div className="h-8 w-8 rounded-full bg-gray-700" />
          <div className="ml-3">
            <p className="text-sm font-medium text-white">Teleoperator</p>
            <p className="text-xs text-gray-400">View profile</p>
          </div>
        </div>
      </div>
    </div>
  );
}
