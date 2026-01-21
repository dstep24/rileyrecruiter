'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout';
import { Card, CardContent, Button, Badge } from '@/components/ui';
import { Building2, Plus, Settings, MoreVertical, Users, FileText, Target, RefreshCw } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface TenantStats {
  candidates: number;
  tasks: number;
  jobRequisitions: number;
  approvalRate: number;
}

interface TenantData {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  stats: TenantStats;
}

const statusConfig: Record<string, { color: string; label: string }> = {
  ONBOARDING: { color: 'purple', label: 'Onboarding' },
  SHADOW_MODE: { color: 'warning', label: 'Shadow Mode' },
  SUPERVISED: { color: 'primary', label: 'Supervised' },
  AUTONOMOUS: { color: 'success', label: 'Autonomous' },
  PAUSED: { color: 'danger', label: 'Paused' },
  ACTIVE: { color: 'success', label: 'Active' },
};

export default function TenantsPage() {
  const [tenants, setTenants] = useState<TenantData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/analytics/tenants`);
      if (res.ok) {
        const data = await res.json();
        setTenants(data.tenants || []);
      } else {
        setError('Failed to fetch tenants');
      }
    } catch (err) {
      console.error('Failed to fetch tenants:', err);
      setError('Failed to connect to API');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  const getAutonomyLevel = (status: string, approvalRate: number): string => {
    if (status === 'ONBOARDING') return 'none';
    if (status === 'SHADOW_MODE') return 'conservative';
    if (status === 'SUPERVISED') return approvalRate > 0.9 ? 'moderate' : 'conservative';
    if (status === 'AUTONOMOUS') return 'high';
    return 'conservative';
  };

  const totalCandidates = tenants.reduce((sum, t) => sum + t.stats.candidates, 0);
  const totalTasks = tenants.reduce((sum, t) => sum + t.stats.tasks, 0);
  const tenantsWithApproval = tenants.filter((t) => t.stats.approvalRate > 0);
  const avgApprovalRate = tenantsWithApproval.length > 0
    ? tenantsWithApproval.reduce((sum, t) => sum + t.stats.approvalRate, 0) / tenantsWithApproval.length
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Tenants"
        description="Manage client companies using Riley"
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={fetchTenants}
              className="px-3 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Tenant
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-6 overflow-auto">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

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
                  <p className="text-2xl font-semibold text-gray-900">{totalCandidates}</p>
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
                  <p className="text-2xl font-semibold text-gray-900">{totalTasks}</p>
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
                    {avgApprovalRate > 0 ? `${(avgApprovalRate * 100).toFixed(0)}%` : '-'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tenant List */}
        {tenants.length > 0 ? (
          <div className="space-y-4">
            {tenants.map((tenant) => {
              const autonomyLevel = getAutonomyLevel(tenant.status, tenant.stats.approvalRate);
              const statusInfo = statusConfig[tenant.status] || { color: 'default', label: tenant.status };

              return (
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
                            statusInfo.color as
                              | 'success'
                              | 'warning'
                              | 'danger'
                              | 'primary'
                              | 'purple'
                              | 'default'
                          }
                        >
                          {statusInfo.label}
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
                          <span className="font-medium">Getting started</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-gray-100">
                          <div className="h-2 w-1/5 rounded-full bg-purple-500" />
                        </div>
                      </div>
                    )}

                    {/* Autonomy indicator */}
                    {tenant.status !== 'ONBOARDING' && autonomyLevel !== 'none' && (
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
                                    ['conservative', 'moderate', 'high'].indexOf(autonomyLevel)
                                      ? 'bg-blue-500'
                                      : 'bg-gray-200'
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="text-sm font-medium capitalize">{autonomyLevel}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <Building2 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No tenants yet</h3>
              <p className="text-gray-500 mb-4">Get started by adding your first client company</p>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Tenant
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
