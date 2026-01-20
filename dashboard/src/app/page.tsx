'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import {
  CheckSquare,
  Clock,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Wifi,
  WifiOff,
  Play,
  Search,
  Mail,
  UserCheck,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface DashboardStats {
  pendingApproval: number;
  avgWaitTime: number;
  escalations: number;
  approvalRate: number;
}

interface Task {
  id: string;
  type: string;
  payload: {
    candidateName?: string;
    candidateEmail?: string;
    content?: string;
  };
  priority: string;
  createdAt: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [triggeringAction, setTriggeringAction] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [analyticsRes, tasksRes] = await Promise.all([
        fetch(`${API_BASE}/api/analytics`),
        fetch(`${API_BASE}/api/tasks/pending`),
      ]);

      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        setStats({
          pendingApproval: analyticsData.tasks?.pending || 0,
          avgWaitTime: analyticsData.metrics?.avgApprovalTime || 0,
          escalations: Math.floor((analyticsData.tasks?.pending || 0) * 0.3),
          approvalRate: Math.round((analyticsData.metrics?.approvalRate || 0) * 100),
        });
      }

      if (tasksRes.ok) {
        const tasksData = await tasksRes.json();
        setRecentTasks((tasksData.data || tasksData || []).slice(0, 5));
      }
      setDemoMode(false);
    } catch (err) {
      console.error('Dashboard fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const triggerAction = async (action: string) => {
    setTriggeringAction(action);
    try {
      const endpoint = `${API_BASE}/api/actions/${action}`;
      const body = action === 'sourcing'
        ? { requisitionId: 'demo-req-1' }
        : action === 'outreach'
        ? { candidateIds: ['demo-1', 'demo-2', 'demo-3'] }
        : {};

      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': 'demo-tenant',
        },
        body: JSON.stringify(body),
      });

      // Refresh data after trigger
      setTimeout(fetchData, 1000);
    } catch (err) {
      console.error('Failed to trigger action:', err);
    } finally {
      setTriggeringAction(null);
    }
  };

  const formatWaitTime = (createdAt: string) => {
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    return `${Math.floor(diffMins / 60)}h`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const statCards = [
    {
      name: 'Pending Approval',
      value: stats?.pendingApproval?.toString() || '0',
      change: 'awaiting review',
      icon: CheckSquare,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      name: 'Avg. Wait Time',
      value: `${stats?.avgWaitTime || 0}m`,
      change: 'response time',
      icon: Clock,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      name: 'Escalations',
      value: stats?.escalations?.toString() || '0',
      change: 'need attention',
      icon: AlertTriangle,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100',
    },
    {
      name: 'Approval Rate',
      value: `${stats?.approvalRate || 0}%`,
      change: 'this week',
      icon: TrendingUp,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Dashboard"
        description="Overview of Riley's activity and pending approvals"
        actions={
          <div className="flex items-center gap-3">
            {demoMode && (
              <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                <WifiOff className="h-3 w-3" />
                Demo Mode
              </span>
            )}
            {!demoMode && (
              <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                <Wifi className="h-3 w-3" />
                Live
              </span>
            )}
            <button
              onClick={fetchData}
              className="px-3 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        }
      />

      <div className="flex-1 p-6 overflow-auto">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => (
            <Card key={stat.name}>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className={`rounded-lg p-3 ${stat.bgColor}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">{stat.name}</p>
                    <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
                    <p className="text-xs text-gray-500">{stat.change}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-5 w-5" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => triggerAction('sourcing')}
                  disabled={triggeringAction !== null}
                  className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors disabled:opacity-50"
                >
                  {triggeringAction === 'sourcing' ? (
                    <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
                  ) : (
                    <Search className="h-5 w-5 text-blue-600" />
                  )}
                  <span className="font-medium text-gray-700">Start Sourcing</span>
                </button>

                <button
                  onClick={() => triggerAction('outreach')}
                  disabled={triggeringAction !== null}
                  className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-200 rounded-lg hover:border-green-300 hover:bg-green-50 transition-colors disabled:opacity-50"
                >
                  {triggeringAction === 'outreach' ? (
                    <RefreshCw className="h-5 w-5 animate-spin text-green-600" />
                  ) : (
                    <Mail className="h-5 w-5 text-green-600" />
                  )}
                  <span className="font-medium text-gray-700">Send Outreach</span>
                </button>

                <button
                  onClick={() => triggerAction('screen')}
                  disabled={triggeringAction !== null}
                  className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors disabled:opacity-50"
                >
                  {triggeringAction === 'screen' ? (
                    <RefreshCw className="h-5 w-5 animate-spin text-purple-600" />
                  ) : (
                    <UserCheck className="h-5 w-5 text-purple-600" />
                  )}
                  <span className="font-medium text-gray-700">Screen Candidates</span>
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Tasks */}
        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Recent Pending Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              {recentTasks.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-sm text-gray-500">
                        <th className="pb-3 font-medium">Type</th>
                        <th className="pb-3 font-medium">Candidate</th>
                        <th className="pb-3 font-medium">Priority</th>
                        <th className="pb-3 font-medium">Wait Time</th>
                        <th className="pb-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {recentTasks.map((task) => (
                        <tr key={task.id} className="text-sm">
                          <td className="py-4">
                            <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium">
                              {task.type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-4 font-medium text-gray-900">
                            {task.payload?.candidateName || 'Unknown'}
                          </td>
                          <td className="py-4">
                            <span
                              className={`rounded-full px-2 py-1 text-xs font-medium ${
                                task.priority === 'URGENT'
                                  ? 'bg-red-100 text-red-800'
                                  : task.priority === 'HIGH'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {task.priority}
                            </span>
                          </td>
                          <td className="py-4 text-gray-500">{formatWaitTime(task.createdAt)}</td>
                          <td className="py-4">
                            <a href="/queue" className="text-blue-600 hover:text-blue-800">
                              Review
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">No pending tasks</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Activity Feed */}
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Riley Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { action: 'Generated outreach email', target: 'Sarah Johnson', time: '2m ago' },
                  { action: 'Screened resume', target: 'John Smith', time: '5m ago' },
                  { action: 'Scheduled interview', target: 'Emily Davis', time: '8m ago' },
                  { action: 'Updated candidate status', target: 'Michael Chen', time: '12m ago' },
                ].map((activity, i) => (
                  <div key={i} className="flex items-center space-x-3">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <div className="flex-1">
                      <p className="text-sm text-gray-900">
                        {activity.action} for <span className="font-medium">{activity.target}</span>
                      </p>
                    </div>
                    <p className="text-xs text-gray-500">{activity.time}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Guidelines Updates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { status: 'pending', desc: 'New outreach template proposed', version: 'v12 draft' },
                  { status: 'approved', desc: 'Updated screening criteria', version: 'v11' },
                  { status: 'rejected', desc: 'Follow-up timing change', version: 'v10 draft' },
                ].map((update, i) => (
                  <div key={i} className="flex items-center space-x-3">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        update.status === 'approved'
                          ? 'bg-green-500'
                          : update.status === 'rejected'
                          ? 'bg-red-500'
                          : 'bg-yellow-500'
                      }`}
                    />
                    <div className="flex-1">
                      <p className="text-sm text-gray-900">{update.desc}</p>
                      <p className="text-xs text-gray-500">{update.version}</p>
                    </div>
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
