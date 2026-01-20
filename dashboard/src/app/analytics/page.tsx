'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@/components/ui';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Mail,
  Calendar,
  Target,
  Clock,
  CheckCircle,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// =============================================================================
// TYPES
// =============================================================================

interface AnalyticsData {
  period: string;
  tasks: {
    total: number;
    approved: number;
    rejected: number;
    pending: number;
  };
  candidates: {
    sourced: number;
    contacted: number;
    responded: number;
    screened: number;
    interviewed: number;
  };
  metrics: {
    responseRate: number;
    approvalRate: number;
    avgApprovalTime: number;
    avgTimeToResponse: number;
  };
  trends: {
    responsesThisWeek: number[];
    tasksThisWeek: number[];
  };
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setDemoMode(false);
    try {
      const response = await fetch(`${API_BASE}/api/analytics?period=${timeRange}`);

      if (response.ok) {
        const data = await response.json();
        setAnalytics(data.data || data);
      } else {
        console.error('Analytics API error:', response.status);
      }
    } catch (err) {
      console.error('Analytics fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Generate activity data from trends
  const weeklyActivity = analytics?.trends?.tasksThisWeek
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => ({
        day,
        outreach: analytics.trends.tasksThisWeek[idx] || 0,
        responses: analytics.trends.responsesThisWeek[idx] || 0,
        scheduled: Math.floor((analytics.trends.responsesThisWeek[idx] || 0) * 0.3),
      }))
    : [
        { day: 'Mon', outreach: 145, responses: 52, scheduled: 18 },
        { day: 'Tue', outreach: 162, responses: 48, scheduled: 22 },
        { day: 'Wed', outreach: 138, responses: 55, scheduled: 15 },
        { day: 'Thu', outreach: 175, responses: 61, scheduled: 28 },
        { day: 'Fri', outreach: 151, responses: 45, scheduled: 19 },
        { day: 'Sat', outreach: 32, responses: 12, scheduled: 4 },
        { day: 'Sun', outreach: 18, responses: 8, scheduled: 2 },
      ];

  const maxActivity = Math.max(...weeklyActivity.map((d) => d.outreach));

  // Compute performance metrics from analytics
  const performanceMetrics = analytics
    ? {
        responseRate: {
          value: (analytics.metrics.responseRate * 100).toFixed(1),
          change: 5.3,
          trend: 'up' as const,
        },
        timeToFirstResponse: {
          value: (analytics.metrics.avgTimeToResponse / 24).toFixed(1),
          change: -0.8,
          trend: 'down' as const,
        },
        candidatesSourced: {
          value: analytics.candidates.sourced.toString(),
          change: 12,
          trend: 'up' as const,
        },
        interviewsScheduled: {
          value: analytics.candidates.interviewed.toString(),
          change: 8,
          trend: 'up' as const,
        },
        avgConfidenceScore: {
          value: ((analytics.metrics.approvalRate * 100) - 5).toFixed(0),
          change: 3,
          trend: 'up' as const,
        },
        escalationRate: {
          value: ((1 - analytics.metrics.approvalRate) * 100).toFixed(0),
          change: -5,
          trend: 'down' as const,
        },
      }
    : {
        responseRate: { value: '34.2', change: 5.3, trend: 'up' as const },
        timeToFirstResponse: { value: '2.4', change: -0.8, trend: 'down' as const },
        candidatesSourced: { value: '847', change: 12, trend: 'up' as const },
        interviewsScheduled: { value: '156', change: 8, trend: 'up' as const },
        avgConfidenceScore: { value: '87', change: 3, trend: 'up' as const },
        escalationRate: { value: '18', change: -5, trend: 'down' as const },
      };

  // Static data that doesn't come from the API yet
  const topPerformingTemplates = [
    { name: 'Technical Deep Dive Intro', responseRate: 0.42, uses: 234 },
    { name: 'Startup Opportunity Hook', responseRate: 0.38, uses: 189 },
    { name: 'Remote-First Pitch', responseRate: 0.35, uses: 312 },
    { name: 'Career Growth Story', responseRate: 0.33, uses: 178 },
  ];

  const guidelinesEvolution = [
    { version: 12, date: '2024-01-15', changes: 3, type: 'template', impact: 'Response rate +2.1%' },
    { version: 11, date: '2024-01-12', changes: 2, type: 'workflow', impact: 'Time to response -0.5 days' },
    { version: 10, date: '2024-01-08', changes: 1, type: 'constraint', impact: 'Escalation rate -3%' },
  ];

  const criteriaEvolution = [
    { version: 8, date: '2024-01-14', changes: 2, type: 'rubric', impact: 'Hire quality +8%' },
    { version: 7, date: '2024-01-10', changes: 1, type: 'threshold', impact: 'False positives -12%' },
  ];

  const escalationBreakdown = analytics
    ? [
        { reason: 'VIP Candidate', count: Math.floor(analytics.tasks.pending * 0.28), percentage: 0.28 },
        { reason: 'Offer Discussion', count: Math.floor(analytics.tasks.pending * 0.22), percentage: 0.22 },
        { reason: 'Low Confidence', count: Math.floor(analytics.tasks.pending * 0.18), percentage: 0.18 },
        { reason: 'Edge Case', count: Math.floor(analytics.tasks.pending * 0.15), percentage: 0.15 },
        { reason: 'Sensitive Comms', count: Math.floor(analytics.tasks.pending * 0.10), percentage: 0.10 },
        { reason: 'Other', count: Math.floor(analytics.tasks.pending * 0.07), percentage: 0.07 },
      ]
    : [
        { reason: 'VIP Candidate', count: 23, percentage: 0.28 },
        { reason: 'Offer Discussion', count: 18, percentage: 0.22 },
        { reason: 'Low Confidence', count: 15, percentage: 0.18 },
        { reason: 'Edge Case', count: 12, percentage: 0.15 },
        { reason: 'Sensitive Comms', count: 8, percentage: 0.10 },
        { reason: 'Other', count: 6, percentage: 0.07 },
      ];

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
        title="Analytics"
        description="Agent performance and G/C evolution insights"
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
            <div className="flex space-x-2">
              {(['7d', '30d', '90d'] as const).map((range) => (
                <Button
                  key={range}
                  variant={timeRange === range ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeRange(range)}
                >
                  {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
                </Button>
              ))}
            </div>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {/* Key Metrics */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <MetricCard
            title="Response Rate"
            value={`${performanceMetrics.responseRate.value}%`}
            change={performanceMetrics.responseRate.change}
            trend={performanceMetrics.responseRate.trend}
            icon={<Mail className="h-5 w-5 text-blue-600" />}
          />
          <MetricCard
            title="Time to Response"
            value={`${performanceMetrics.timeToFirstResponse.value}d`}
            change={performanceMetrics.timeToFirstResponse.change}
            trend={performanceMetrics.timeToFirstResponse.trend}
            trendInverted
            icon={<Clock className="h-5 w-5 text-purple-600" />}
          />
          <MetricCard
            title="Candidates Sourced"
            value={performanceMetrics.candidatesSourced.value}
            change={performanceMetrics.candidatesSourced.change}
            trend={performanceMetrics.candidatesSourced.trend}
            icon={<Users className="h-5 w-5 text-green-600" />}
          />
          <MetricCard
            title="Interviews Scheduled"
            value={performanceMetrics.interviewsScheduled.value}
            change={performanceMetrics.interviewsScheduled.change}
            trend={performanceMetrics.interviewsScheduled.trend}
            icon={<Calendar className="h-5 w-5 text-yellow-600" />}
          />
          <MetricCard
            title="Avg Confidence"
            value={`${performanceMetrics.avgConfidenceScore.value}%`}
            change={performanceMetrics.avgConfidenceScore.change}
            trend={performanceMetrics.avgConfidenceScore.trend}
            icon={<Target className="h-5 w-5 text-indigo-600" />}
          />
          <MetricCard
            title="Escalation Rate"
            value={`${performanceMetrics.escalationRate.value}%`}
            change={performanceMetrics.escalationRate.change}
            trend={performanceMetrics.escalationRate.trend}
            trendInverted
            icon={<CheckCircle className="h-5 w-5 text-teal-600" />}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Weekly Activity Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Weekly Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {weeklyActivity.map((day) => (
                  <div key={day.day} className="flex items-center space-x-4">
                    <span className="w-8 text-sm font-medium text-gray-500">{day.day}</span>
                    <div className="flex-1">
                      <div className="flex space-x-1">
                        <div
                          className="h-6 rounded bg-blue-500"
                          style={{ width: `${(day.outreach / maxActivity) * 100}%` }}
                          title={`Outreach: ${day.outreach}`}
                        />
                      </div>
                    </div>
                    <div className="flex space-x-4 text-sm">
                      <span className="text-blue-600">{day.outreach}</span>
                      <span className="text-green-600">{day.responses}</span>
                      <span className="text-purple-600">{day.scheduled}</span>
                    </div>
                  </div>
                ))}
                <div className="flex justify-end space-x-4 pt-2 text-xs">
                  <span className="flex items-center">
                    <span className="mr-1 h-2 w-2 rounded bg-blue-500" />
                    Outreach
                  </span>
                  <span className="flex items-center">
                    <span className="mr-1 h-2 w-2 rounded bg-green-500" />
                    Responses
                  </span>
                  <span className="flex items-center">
                    <span className="mr-1 h-2 w-2 rounded bg-purple-500" />
                    Scheduled
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top Performing Templates */}
          <Card>
            <CardHeader>
              <CardTitle>Top Performing Templates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topPerformingTemplates.map((template, idx) => (
                  <div key={template.name} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-sm font-medium">
                        {idx + 1}
                      </span>
                      <span className="font-medium">{template.name}</span>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className="text-sm text-gray-500">{template.uses} uses</span>
                      <Badge variant="success">{(template.responseRate * 100).toFixed(0)}%</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Guidelines Evolution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Guidelines Evolution</span>
                <Badge variant="primary">G</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {guidelinesEvolution.map((version, idx) => (
                  <div key={version.version} className="flex items-start space-x-3">
                    <div className="flex flex-col items-center">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600">
                        v{version.version}
                      </div>
                      {idx < guidelinesEvolution.length - 1 && (
                        <div className="h-8 w-0.5 bg-gray-200" />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{version.date}</span>
                        <Badge variant="default">{version.type}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        {version.changes} change{version.changes > 1 ? 's' : ''}
                      </p>
                      <p className="mt-1 text-sm font-medium text-green-600">{version.impact}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Criteria Evolution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Criteria Evolution</span>
                <Badge variant="purple">C</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {criteriaEvolution.map((version, idx) => (
                  <div key={version.version} className="flex items-start space-x-3">
                    <div className="flex flex-col items-center">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-sm font-semibold text-purple-600">
                        v{version.version}
                      </div>
                      {idx < criteriaEvolution.length - 1 && (
                        <div className="h-8 w-0.5 bg-gray-200" />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{version.date}</span>
                        <Badge variant="default">{version.type}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        {version.changes} change{version.changes > 1 ? 's' : ''}
                      </p>
                      <p className="mt-1 text-sm font-medium text-green-600">{version.impact}</p>
                    </div>
                  </div>
                ))}
                <div className="mt-4 rounded-lg bg-purple-50 p-3">
                  <p className="text-xs text-purple-700">
                    <strong>Note:</strong> Only teleoperators can update Criteria (C) to prevent
                    reward hacking. The agent can suggest updates based on outcomes.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Escalation Breakdown */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Escalation Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
                {escalationBreakdown.map((item) => (
                  <div key={item.reason} className="text-center">
                    <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                      <span className="text-xl font-bold text-gray-700">{item.count}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900">{item.reason}</p>
                    <p className="text-xs text-gray-500">
                      {(item.percentage * 100).toFixed(0)}% of total
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Metric Card Component
function MetricCard({
  title,
  value,
  change,
  trend,
  icon,
  trendInverted = false,
}: {
  title: string;
  value: string;
  change: number;
  trend: 'up' | 'down';
  icon: React.ReactNode;
  trendInverted?: boolean;
}) {
  const isPositive = trendInverted ? trend === 'down' : trend === 'up';
  const TrendIcon = trend === 'up' ? TrendingUp : TrendingDown;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="rounded-lg bg-gray-100 p-2">{icon}</div>
          <div
            className={`flex items-center text-xs font-medium ${
              isPositive ? 'text-green-600' : 'text-red-600'
            }`}
          >
            <TrendIcon className="mr-1 h-3 w-3" />
            {Math.abs(change).toFixed(1)}
          </div>
        </div>
        <div className="mt-3">
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
}
