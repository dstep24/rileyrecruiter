'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@/components/ui';
import {
  FileText,
  GitBranch,
  Check,
  X,
  Clock,
  ChevronRight,
  Plus,
  Settings,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// =============================================================================
// TYPES
// =============================================================================

interface GuidelinesVersion {
  id: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'REJECTED';
  createdBy: 'AGENT' | 'TELEOPERATOR';
  changelog: string;
  createdAt: string;
}

interface Guidelines {
  id: string;
  tenantId: string;
  version: number;
  status: string;
  workflows: Array<{ id: string; name: string; description?: string; stages?: string[] }>;
  templates: Array<{ id: string; name: string; channel?: string; purpose?: string }>;
  constraints: Array<{ id: string; name: string; type?: string; config?: Record<string, unknown> }>;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

const statusColors = {
  DRAFT: 'warning',
  ACTIVE: 'success',
  ARCHIVED: 'default',
  REJECTED: 'danger',
} as const;

export default function GuidelinesPage() {
  const [versions, setVersions] = useState<GuidelinesVersion[]>([]);
  const [guidelines, setGuidelines] = useState<Guidelines | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'workflows' | 'templates' | 'constraints'>('templates');
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Try real API first - versions
      const versionsRes = await fetch(`${API_BASE}/api/guidelines/versions`, {
        headers: { 'X-Tenant-Id': 'demo-tenant' },
      });

      if (versionsRes.ok) {
        const versionsData = await versionsRes.json();
        setVersions(versionsData.data || versionsData || []);
        setDemoMode(false);

        // Fetch active guidelines
        const guidelinesRes = await fetch(`${API_BASE}/api/guidelines`, {
          headers: { 'X-Tenant-Id': 'demo-tenant' },
        });
        if (guidelinesRes.ok) {
          const guidelinesData = await guidelinesRes.json();
          setGuidelines(guidelinesData.data || guidelinesData);
        }
      } else {
        throw new Error('API unavailable');
      }
    } catch {
      // Fall back to demo mode
      setDemoMode(true);
      try {
        const [versionsRes, guidelinesRes] = await Promise.all([
          fetch(`${API_BASE}/api/guidelines/versions`),
          fetch(`${API_BASE}/api/guidelines`),
        ]);

        if (versionsRes.ok) {
          const versionsData = await versionsRes.json();
          setVersions(versionsData);
        }
        if (guidelinesRes.ok) {
          const guidelinesData = await guidelinesRes.json();
          setGuidelines(guidelinesData);
        }
      } catch (demoErr) {
        console.error('Demo mode also failed:', demoErr);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (versions.length > 0 && !selectedVersion) {
      const activeVersion = versions.find((v) => v.status === 'ACTIVE');
      setSelectedVersion(activeVersion?.id || versions[0].id);
    }
  }, [versions, selectedVersion]);

  const activeVersion = versions.find((v) => v.id === selectedVersion);

  const handleActivate = async (versionId: string) => {
    if (demoMode) {
      // Simulate activation in demo mode
      setVersions((prev) =>
        prev.map((v) => ({
          ...v,
          status: v.id === versionId ? 'ACTIVE' : v.status === 'ACTIVE' ? 'ARCHIVED' : v.status,
        }))
      );
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/guidelines/${versionId}/activate`, {
        method: 'POST',
        headers: { 'X-Tenant-Id': 'demo-tenant' },
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Failed to activate version:', err);
    }
  };

  const handleReject = async (versionId: string) => {
    if (demoMode) {
      setVersions((prev) =>
        prev.map((v) => ({
          ...v,
          status: v.id === versionId ? 'REJECTED' : v.status,
        }))
      );
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/guidelines/${versionId}/reject`, {
        method: 'POST',
        headers: { 'X-Tenant-Id': 'demo-tenant' },
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Failed to reject version:', err);
    }
  };

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
        title="Guidelines"
        description="Manage how Riley recruits - workflows, templates, and constraints"
        actions={
          <div className="flex items-center gap-3">
            {demoMode && (
              <Badge variant="warning" className="flex items-center gap-1">
                <WifiOff className="h-3 w-3" />
                Demo Mode
              </Badge>
            )}
            {!demoMode && (
              <Badge variant="success" className="flex items-center gap-1">
                <Wifi className="h-3 w-3" />
                Live
              </Badge>
            )}
            <Button onClick={fetchData} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Version
            </Button>
          </div>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Version Sidebar */}
        <div className="w-64 border-r border-gray-200 bg-white p-4">
          <h3 className="mb-4 text-sm font-medium text-gray-500">VERSIONS</h3>
          <div className="space-y-2">
            {versions.map((version) => (
              <button
                key={version.id}
                onClick={() => setSelectedVersion(version.id)}
                className={`w-full rounded-lg p-3 text-left transition-colors ${
                  selectedVersion === version.id
                    ? 'bg-blue-50 border border-blue-200'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">v{version.version}</span>
                  <Badge variant={statusColors[version.status] as 'success' | 'warning' | 'danger' | 'default'}>
                    {version.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-gray-500 line-clamp-2">{version.changelog}</p>
                <div className="mt-2 flex items-center text-xs text-gray-400">
                  {version.createdBy === 'AGENT' ? (
                    <span className="flex items-center">
                      <Settings className="mr-1 h-3 w-3" />
                      Riley
                    </span>
                  ) : (
                    <span>Teleoperator</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Version Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-3">
                <h2 className="text-xl font-semibold">Version {activeVersion?.version}</h2>
                <Badge variant={statusColors[activeVersion?.status || 'DRAFT'] as 'success' | 'warning' | 'danger' | 'default'}>
                  {activeVersion?.status}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-gray-500">{activeVersion?.changelog}</p>
            </div>
            {activeVersion?.status === 'DRAFT' && (
              <div className="flex space-x-2">
                <Button variant="success" onClick={() => handleActivate(activeVersion.id)}>
                  <Check className="mr-2 h-4 w-4" />
                  Activate
                </Button>
                <Button variant="destructive" onClick={() => handleReject(activeVersion.id)}>
                  <X className="mr-2 h-4 w-4" />
                  Reject
                </Button>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="mb-6 border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {(['templates', 'workflows', 'constraints'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`border-b-2 pb-4 text-sm font-medium ${
                    activeTab === tab
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs">
                    {guidelines?.[tab]?.length || 0}
                  </span>
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="space-y-4">
            {activeTab === 'templates' && (
              <>
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Message Templates</h3>
                  <Button variant="outline" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Template
                  </Button>
                </div>
                {(guidelines?.templates || []).map((template) => (
                  <Card key={template.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{template.name}</h4>
                          <p className="text-sm text-gray-500">
                            {template.channel && `${template.channel} • `}
                            {template.purpose?.replace(/_/g, ' ')}
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {(!guidelines?.templates || guidelines.templates.length === 0) && (
                  <p className="text-gray-500 text-center py-8">No templates defined yet.</p>
                )}
              </>
            )}

            {activeTab === 'workflows' && (
              <>
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Recruiting Workflows</h3>
                  <Button variant="outline" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Workflow
                  </Button>
                </div>
                {(guidelines?.workflows || []).map((workflow) => (
                  <Card key={workflow.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{workflow.name}</h4>
                          <p className="text-sm text-gray-500">
                            {workflow.description || (workflow.stages ? `${workflow.stages.length} stages` : '')}
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {(!guidelines?.workflows || guidelines.workflows.length === 0) && (
                  <p className="text-gray-500 text-center py-8">No workflows defined yet.</p>
                )}
              </>
            )}

            {activeTab === 'constraints' && (
              <>
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Constraints</h3>
                  <Button variant="outline" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Constraint
                  </Button>
                </div>
                {(guidelines?.constraints || []).map((constraint) => (
                  <Card key={constraint.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{constraint.name}</h4>
                          <p className="text-sm text-gray-500">
                            Type: {constraint.type?.replace(/_/g, ' ') || 'General'}
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {(!guidelines?.constraints || guidelines.constraints.length === 0) && (
                  <p className="text-gray-500 text-center py-8">No constraints defined yet.</p>
                )}
              </>
            )}
          </div>

          {/* Diff View (for drafts) */}
          {activeVersion?.status === 'DRAFT' && (
            <Card className="mt-8">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <GitBranch className="mr-2 h-5 w-5" />
                  Changes from v{(activeVersion.version || 1) - 1}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2 text-sm">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-green-700">+1 template added</span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm">
                    <span className="h-2 w-2 rounded-full bg-yellow-500" />
                    <span className="text-yellow-700">2 templates modified</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
