'use client';

import { useState } from 'react';
import { Header } from '@/components/layout';
import { Card, CardContent, Button, Badge } from '@/components/ui';
import { Building2, Plus, Settings, MoreVertical, Users, FileText, Target } from 'lucide-react';
import type { Tenant } from '@/types';

// Mock data
const mockTenants: (Tenant & {
  stats: { candidates: number; tasks: number; approvalRate: number };
  autonomyLevel: string;
})[] = [
  {
    id: 'tenant-1',
    name: 'TechCorp Inc.',
    slug: 'techcorp',
    status: 'AUTONOMOUS',
    createdAt: new Date(Date.now() - 30 * 24 * 3600000).toISOString(),
    stats: { candidates: 245, tasks: 1250, approvalRate: 0.94 },
    autonomyLevel: 'high',
  },
  {
    id: 'tenant-2',
    name: 'StartupXYZ',
    slug: 'startupxyz',
    status: 'SUPERVISED',
    createdAt: new Date(Date.now() - 14 * 24 * 3600000).toISOString(),
    stats: { candidates: 67, tasks: 320, approvalRate: 0.88 },
    autonomyLevel: 'moderate',
  },
  {
    id: 'tenant-3',
    name: 'Global Finance Co.',
    slug: 'globalfinance',
    status: 'SHADOW_MODE',
    createdAt: new Date(Date.now() - 5 * 24 * 3600000).toISOString(),
    stats: { candidates: 23, tasks: 85, approvalRate: 0.75 },
    autonomyLevel: 'conservative',
  },
  {
    id: 'tenant-4',
    name: 'HealthTech Solutions',
    slug: 'healthtech',
    status: 'ONBOARDING',
    createdAt: new Date(Date.now() - 2 * 24 * 3600000).toISOString(),
    stats: { candidates: 0, tasks: 0, approvalRate: 0 },
    autonomyLevel: 'conservative',
  },
];

const statusConfig = {
  ONBOARDING: { color: 'purple', label: 'Onboarding' },
  SHADOW_MODE: { color: 'warning', label: 'Shadow Mode' },
  SUPERVISED: { color: 'primary', label: 'Supervised' },
  AUTONOMOUS: { color: 'success', label: 'Autonomous' },
  PAUSED: { color: 'danger', label: 'Paused' },
} as const;

export default function TenantsPage() {
  const [tenants] = useState(mockTenants);

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Tenants"
        description="Manage client companies using Riley"
        actions={
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Tenant
          </Button>
        }
      />

      <div className="flex-1 p-6">
        {/* Stats Overview */}
        <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="rounded-lg bg-blue-100 p-3">
                  <Building2 className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total Tenants</p>
                  <p className="text-2xl font-semibold text-gray-900">{tenants.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="rounded-lg bg-green-100 p-3">
                  <Users className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Active Candidates</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {tenants.reduce((sum, t) => sum + t.stats.candidates, 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="rounded-lg bg-purple-100 p-3">
                  <FileText className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total Tasks</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {tenants.reduce((sum, t) => sum + t.stats.tasks, 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="rounded-lg bg-yellow-100 p-3">
                  <Target className="h-6 w-6 text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Avg. Approval Rate</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {(
                      (tenants.reduce((sum, t) => sum + t.stats.approvalRate, 0) /
                        tenants.filter((t) => t.stats.approvalRate > 0).length) *
                      100
                    ).toFixed(0)}
                    %
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tenant List */}
        <div className="space-y-4">
          {tenants.map((tenant) => (
            <Card key={tenant.id}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
                      <Building2 className="h-6 w-6 text-gray-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{tenant.name}</h3>
                      <p className="text-sm text-gray-500">/{tenant.slug}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-8">
                    <Badge
                      variant={
                        statusConfig[tenant.status].color as
                          | 'success'
                          | 'warning'
                          | 'danger'
                          | 'primary'
                          | 'purple'
                          | 'default'
                      }
                    >
                      {statusConfig[tenant.status].label}
                    </Badge>

                    <div className="flex space-x-6 text-sm">
                      <div className="text-center">
                        <p className="font-semibold text-gray-900">{tenant.stats.candidates}</p>
                        <p className="text-gray-500">Candidates</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-gray-900">{tenant.stats.tasks}</p>
                        <p className="text-gray-500">Tasks</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-gray-900">
                          {tenant.stats.approvalRate > 0
                            ? `${(tenant.stats.approvalRate * 100).toFixed(0)}%`
                            : '-'}
                        </p>
                        <p className="text-gray-500">Approval</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Button variant="outline" size="sm">
                        <Settings className="mr-2 h-4 w-4" />
                        Configure
                      </Button>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Progress bar for onboarding tenants */}
                {tenant.status === 'ONBOARDING' && (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Onboarding Progress</span>
                      <span className="font-medium">Step 2 of 5</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-gray-100">
                      <div className="h-2 w-2/5 rounded-full bg-purple-500" />
                    </div>
                  </div>
                )}

                {/* Autonomy indicator */}
                {tenant.status !== 'ONBOARDING' && (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Autonomy Level</span>
                      <div className="flex items-center space-x-2">
                        <div className="flex space-x-1">
                          {['conservative', 'moderate', 'high'].map((level, i) => (
                            <div
                              key={level}
                              className={`h-2 w-8 rounded ${
                                i <=
                                ['conservative', 'moderate', 'high'].indexOf(tenant.autonomyLevel)
                                  ? 'bg-blue-500'
                                  : 'bg-gray-200'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-sm font-medium capitalize">{tenant.autonomyLevel}</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
