'use client';

import { Bell, Search } from 'lucide-react';
import { Button } from '@/components/ui';

interface HeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function Header({ title, description, actions }: HeaderProps) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="flex h-16 items-center justify-between px-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
          {description && <p className="text-sm text-gray-500">{description}</p>}
        </div>

        <div className="flex items-center space-x-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              className="h-9 w-64 rounded-md border border-gray-300 bg-gray-50 pl-9 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5 text-gray-500" />
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
          </Button>

          {/* Custom actions */}
          {actions}
        </div>
      </div>
    </header>
  );
}
