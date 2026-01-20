'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@/components/ui';
import {
  Target,
  Scale,
  AlertTriangle,
  TrendingUp,
  ChevronRight,
  Plus,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// =============================================================================
// TYPES
// =============================================================================

interface CriteriaVersion {
  id: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  createdBy: 'TELEOPERATOR';
  changelog: string;
  createdAt: string;
}

interface QualityStandard {
  id: string;
  name: string;
  description?: string;
  domain?: string;
  threshold?: number;
  minScore?: number;
  weight?: number;
  dimensions?: string[];
}

interface EvaluationRubric {
  id: string;
  name: string;
  purpose?: string;
  taskType?: string;
  dimensions?: string[] | number;
}

interface FailurePattern {
  id: string;
  name: string;
  domain?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

interface SuccessMetric {
  id: string;
  name: string;
  target: number;
  current: number;
}

interface Criteria {
  id: string;
  tenantId: string;
  version: number;
  status: string;
  qualityStandards: QualityStandard[];
  evaluationRubrics: EvaluationRubric[];
  failurePatterns?: FailurePattern[];
  successMetrics?: SuccessMetric[] | Record<string, { target: number; warning?: number; critical?: number }>;
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
} as const;

export default function CriteriaPage() {
  const [versions, setVersions] = useState<CriteriaVersion[]>([]);
  const [criteria, setCriteria] = useState<Criteria | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'qualityStandards' | 'evaluationRubrics' | 'failurePatterns' | 'successMetrics'>('qualityStandards');
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Try real API first
      const versionsRes = await fetch(`${API_BASE}/api/criteria/versions`, {
        headers: { 'X-Tenant-Id': 'demo-tenant' },
      });

      if (versionsRes.ok) {
        const versionsData = await versionsRes.json();
        setVersions(versionsData.data || versionsData || []);
        setDemoMode(false);

        // Fetch active criteria
        const criteriaRes = await fetch(`${API_BASE}/api/criteria`, {
          headers: { 'X-Tenant-Id': 'demo-tenant' },
        });
        if (criteriaRes.ok) {
          const criteriaData = await criteriaRes.json();
          setCriteria(criteriaData.data || criteriaData);
        }
      } else {
        throw new Error('API unavailable');
      }
    } catch {
      // Fall back to demo mode
      setDemoMode(true);
      try {
        const [versionsRes, criteriaRes] = await Promise.all([
          fetch(`${API_BASE}/api/criteria/versions`),
          fetch(`${API_BASE}/api/criteria`),
        ]);

        if (versionsRes.ok) {
          const versionsData = await versionsRes.json();
          setVersions(versionsData);
        }
        if (criteriaRes.ok) {
          const criteriaData = await criteriaRes.json();
          setCriteria(criteriaData);
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

  // Convert successMetrics to array format if it's an object
  const getSuccessMetricsArray = (): SuccessMetric[] => {
    if (!criteria?.successMetrics) return [];
    if (Array.isArray(criteria.successMetrics)) return criteria.successMetrics;

    // Convert object format to array
    return Object.entries(criteria.successMetrics).map(([key, value]) => ({
      id: key,
      name: key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase()),
      target: value.target,
      current: value.target * (0.8 + Math.random() * 0.4), // Generate a mock current value
    }));
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
        title="Criteria"
        description="Define what good recruiting looks like - quality standards and evaluation rubrics"
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
                  <Badge variant={statusColors[version.status] as 'success' | 'warning' | 'default'}>
                    {version.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-gray-500 line-clamp-2">{version.changelog}</p>
              </button>
            ))}
          </div>

          {/* Note about criteria changes */}
          <div className="mt-6 rounded-lg bg-yellow-50 p-3 text-xs text-yellow-800">
            <strong>Note:</strong> Only teleoperators can modify Criteria. This prevents reward hacking by the agent.
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Version Header */}
          <div className="mb-6">
            <div className="flex items-center space-x-3">
              <h2 className="text-xl font-semibold">Version {activeVersion?.version}</h2>
              <Badge variant={statusColors[activeVersion?.status || 'DRAFT'] as 'success' | 'warning' | 'default'}>
                {activeVersion?.status}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-gray-500">{activeVersion?.changelog}</p>
          </div>

          {/* Tabs */}
          <div className="mb-6 border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {([
                { key: 'qualityStandards', label: 'Quality Standards', icon: Target },
                { key: 'evaluationRubrics', label: 'Evaluation Rubrics', icon: Scale },
                { key: 'failurePatterns', label: 'Failure Patterns', icon: AlertTriangle },
                { key: 'successMetrics', label: 'Success Metrics', icon: TrendingUp },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center border-b-2 pb-4 text-sm font-medium ${
                    activeTab === tab.key
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  <tab.icon className="mr-2 h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="space-y-4">
            {activeTab === 'qualityStandards' && (
              <>
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Quality Standards</h3>
                  <Button variant="outline" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Standard
                  </Button>
                </div>
                {(criteria?.qualityStandards || []).map((standard) => (
                  <Card key={standard.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium">{standard.name}</h4>
                          <p className="text-sm text-gray-500">
                            {standard.description || `Domain: ${standard.domain || 'General'}`}
                          </p>
                        </div>
                        <div className="flex items-center space-x-6">
                          {(standard.minScore || standard.threshold) && (
                            <div className="text-center">
                              <p className="text-xs text-gray-500">Min Score</p>
                              <p className="font-medium">
                                {((standard.minScore || standard.threshold || 0) * 100).toFixed(0)}%
                              </p>
                            </div>
                          )}
                          {standard.weight && (
                            <div className="text-center">
                              <p className="text-xs text-gray-500">Weight</p>
                              <p className="font-medium">{(standard.weight * 100).toFixed(0)}%</p>
                            </div>
                          )}
                          <ChevronRight className="h-5 w-5 text-gray-400" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {(!criteria?.qualityStandards || criteria.qualityStandards.length === 0) && (
                  <p className="text-gray-500 text-center py-8">No quality standards defined yet.</p>
                )}
              </>
            )}

            {activeTab === 'evaluationRubrics' && (
              <>
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Evaluation Rubrics</h3>
                  <Button variant="outline" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Rubric
                  </Button>
                </div>
                {(criteria?.evaluationRubrics || []).map((rubric) => (
                  <Card key={rubric.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{rubric.name}</h4>
                          <p className="text-sm text-gray-500">
                            {rubric.purpose?.replace(/_/g, ' ') || rubric.taskType?.replace(/_/g, ' ')}
                            {rubric.dimensions && (
                              <> | {Array.isArray(rubric.dimensions) ? rubric.dimensions.length : rubric.dimensions} dimensions</>
                            )}
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {(!criteria?.evaluationRubrics || criteria.evaluationRubrics.length === 0) && (
                  <p className="text-gray-500 text-center py-8">No evaluation rubrics defined yet.</p>
                )}
              </>
            )}

            {activeTab === 'failurePatterns' && (
              <>
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Failure Patterns</h3>
                  <Button variant="outline" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Pattern
                  </Button>
                </div>
                {(criteria?.failurePatterns || []).map((pattern) => (
                  <Card key={pattern.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{pattern.name}</h4>
                          <p className="text-sm text-gray-500">Domain: {pattern.domain || 'General'}</p>
                        </div>
                        <Badge
                          variant={
                            pattern.severity === 'critical'
                              ? 'danger'
                              : pattern.severity === 'high'
                              ? 'warning'
                              : 'default'
                          }
                        >
                          {pattern.severity || 'medium'}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {(!criteria?.failurePatterns || criteria.failurePatterns.length === 0) && (
                  <p className="text-gray-500 text-center py-8">No failure patterns defined yet.</p>
                )}
              </>
            )}

            {activeTab === 'successMetrics' && (
              <>
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Success Metrics</h3>
                  <Button variant="outline" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Metric
                  </Button>
                </div>
                {getSuccessMetricsArray().map((metric) => (
                  <Card key={metric.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium">{metric.name}</h4>
                        </div>
                        <div className="flex items-center space-x-6">
                          <div className="text-center">
                            <p className="text-xs text-gray-500">Target</p>
                            <p className="font-medium">
                              {metric.target < 1
                                ? `${(metric.target * 100).toFixed(0)}%`
                                : metric.target}
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500">Current</p>
                            <p
                              className={`font-medium ${
                                metric.current >= metric.target ? 'text-green-600' : 'text-yellow-600'
                              }`}
                            >
                              {metric.current < 1
                                ? `${(metric.current * 100).toFixed(0)}%`
                                : metric.current.toFixed(0)}
                            </p>
                          </div>
                          <ChevronRight className="h-5 w-5 text-gray-400" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {getSuccessMetricsArray().length === 0 && (
                  <p className="text-gray-500 text-center py-8">No success metrics defined yet.</p>
                )}
              </>
            )}
          </div>

          {/* Calibration Card */}
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Scale className="mr-2 h-5 w-5" />
                Agent-Human Calibration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-gray-500">
                Compare how Riley&apos;s evaluations align with teleoperator judgments.
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg bg-green-50 p-4 text-center">
                  <p className="text-2xl font-semibold text-green-600">92%</p>
                  <p className="text-sm text-green-700">Alignment Score</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-4 text-center">
                  <p className="text-2xl font-semibold text-gray-600">156</p>
                  <p className="text-sm text-gray-700">Comparisons Made</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-4 text-center">
                  <p className="text-2xl font-semibold text-blue-600">+3%</p>
                  <p className="text-sm text-blue-700">This Week</p>
                </div>
              </div>
              <Button variant="outline" className="mt-4 w-full">
                Run Calibration Session
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
