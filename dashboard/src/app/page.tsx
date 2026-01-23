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
  FileText,
  MessageSquare,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface DashboardStats {
  pendingOutreach: number;
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

// Must match QueuedCandidate from sourcing/page.tsx
interface QueueItem {
  id: string;
  candidateId: string;
  providerId?: string;
  name: string;
  headline?: string;
  currentTitle?: string;
  currentCompany?: string;
  location?: string;
  profileUrl: string;
  profilePictureUrl?: string;
  relevanceScore: number;
  status: 'pending' | 'approved' | 'sent' | 'rejected';
  messageType: 'connection_request' | 'inmail' | 'message';
  messageDraft?: string;
  createdAt: string;
  searchCriteria?: {
    jobTitle: string;
    skills: string[];
  };
}

interface Activity {
  id: string;
  type: string;
  action: string;
  target: string;
  time: string;
}

interface GuidelinesVersion {
  version: number;
  status: string;
  changelog: string | null;
  createdAt: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [guidelinesUpdates, setGuidelinesUpdates] = useState<GuidelinesVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Get pending outreach count and items from localStorage queue
      let pendingOutreachCount = 0;
      let pendingQueueItems: QueueItem[] = [];
      try {
        const savedQueue = localStorage.getItem('riley_messaging_queue');
        if (savedQueue) {
          const queue: QueueItem[] = JSON.parse(savedQueue);
          const pendingItems = queue.filter((item) => item.status === 'pending');
          pendingOutreachCount = pendingItems.length;
          // Get the 5 most recent pending items
          pendingQueueItems = pendingItems
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5);
        }
      } catch {
        // Ignore localStorage errors
      }
      setQueueItems(pendingQueueItems);

      const [analyticsRes, tasksRes, activityRes] = await Promise.all([
        fetch(`${API_BASE}/api/analytics`),
        fetch(`${API_BASE}/api/tasks/pending`),
        fetch(`${API_BASE}/api/analytics/activity?limit=5`),
      ]);

      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        setStats({
          pendingOutreach: pendingOutreachCount,
          avgWaitTime: Math.round(analyticsData.data?.metrics?.avgApprovalTime || 0),
          escalations: analyticsData.data?.escalationBreakdown?.length || 0,
          approvalRate: Math.round((analyticsData.data?.metrics?.approvalRate || 0) * 100),
        });

        // Set guidelines updates from real data
        setGuidelinesUpdates(analyticsData.data?.guidelinesEvolution || []);
      }

      if (tasksRes.ok) {
        const tasksData = await tasksRes.json();
        setRecentTasks((tasksData.data || tasksData || []).slice(0, 5));
      }

      if (activityRes.ok) {
        const activityData = await activityRes.json();
        if (activityData.activities) {
          setActivities(activityData.activities.map((a: Activity) => ({
            ...a,
            time: formatTimeAgo(new Date(a.time)),
          })));
        }
      }

      setDemoMode(false);
    } catch (err) {
      console.error('Dashboard fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const triggerAction = async (action: string) => {
    // Quick actions navigate to the appropriate pages with correct parameters
    if (action === 'sourcing') {
      window.location.href = '/sourcing';
    } else if (action === 'outreach') {
      // Navigate to queue with direct outreach flow (InMail/Direct Message)
      window.location.href = '/queue?flow=direct';
    } else if (action === 'review') {
      // Navigate to queue with connection flow (connection requests)
      window.location.href = '/queue?flow=connection';
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
      name: 'Pending Outreach',
      value: stats?.pendingOutreach?.toString() || '0',
      change: 'ready to send',
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
                  className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
                >
                  <Search className="h-5 w-5 text-blue-600" />
                  <span className="font-medium text-gray-700">Start Sourcing</span>
                </button>

                <button
                  onClick={() => triggerAction('outreach')}
                  className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-200 rounded-lg hover:border-green-300 hover:bg-green-50 transition-colors"
                >
                  <Mail className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-gray-700">Send Outreach</span>
                </button>

                <button
                  onClick={() => triggerAction('review')}
                  className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors"
                >
                  <UserCheck className="h-5 w-5 text-purple-600" />
                  <span className="font-medium text-gray-700">Review Queue</span>
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pending Outreach Queue */}
        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Pending Outreach Queue</CardTitle>
            </CardHeader>
            <CardContent>
              {queueItems.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-sm text-gray-500">
                        <th className="pb-3 font-medium">Type</th>
                        <th className="pb-3 font-medium">Candidate</th>
                        <th className="pb-3 font-medium">Job</th>
                        <th className="pb-3 font-medium">Wait Time</th>
                        <th className="pb-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {queueItems.map((item) => (
                        <tr key={item.id} className="text-sm">
                          <td className="py-4">
                            <span className={`rounded px-2 py-1 text-xs font-medium ${
                              item.messageType === 'connection_request'
                                ? 'bg-blue-100 text-blue-800'
                                : item.messageType === 'inmail'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-green-100 text-green-800'
                            }`}>
                              {item.messageType === 'connection_request' ? 'Connection' : item.messageType === 'inmail' ? 'InMail' : 'Direct'}
                            </span>
                          </td>
                          <td className="py-4">
                            <div>
                              <span className="font-medium text-gray-900">{item.name}</span>
                              {item.headline && (
                                <p className="text-xs text-gray-500 truncate max-w-xs">{item.headline}</p>
                              )}
                            </div>
                          </td>
                          <td className="py-4 text-gray-600 text-sm">
                            {item.searchCriteria?.jobTitle || '-'}
                          </td>
                          <td className="py-4 text-gray-500">{formatWaitTime(item.createdAt)}</td>
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
                <p className="text-gray-500 text-center py-8">No pending outreach in queue</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Activity Feed */}
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Riley Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activities.length > 0 ? (
                <div className="space-y-4">
                  {activities.map((activity) => (
                    <div key={activity.id} className="flex items-center space-x-3">
                      <div className={`h-2 w-2 rounded-full ${
                        activity.type === 'task' ? 'bg-blue-500' :
                        activity.type === 'outreach' ? 'bg-green-500' :
                        'bg-purple-500'
                      }`} />
                      <div className="flex-1">
                        <p className="text-sm text-gray-900">
                          {activity.action} <span className="font-medium">{activity.target}</span>
                        </p>
                      </div>
                      <p className="text-xs text-gray-500">{activity.time}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No recent activity</p>
                  <p className="text-xs mt-1">Activity will appear here as Riley works</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Guidelines Updates
              </CardTitle>
            </CardHeader>
            <CardContent>
              {guidelinesUpdates.length > 0 ? (
                <div className="space-y-4">
                  {guidelinesUpdates.map((update) => (
                    <div key={update.version} className="flex items-center space-x-3">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          update.status === 'ACTIVE'
                            ? 'bg-green-500'
                            : update.status === 'DRAFT'
                            ? 'bg-yellow-500'
                            : 'bg-gray-400'
                        }`}
                      />
                      <div className="flex-1">
                        <p className="text-sm text-gray-900">
                          {update.changelog || `Guidelines version ${update.version}`}
                        </p>
                        <p className="text-xs text-gray-500">v{update.version} • {update.status.toLowerCase()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No guidelines yet</p>
                  <p className="text-xs mt-1">Guidelines will evolve based on your feedback</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
