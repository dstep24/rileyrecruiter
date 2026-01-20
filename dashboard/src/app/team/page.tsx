'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Wifi, WifiOff, UserPlus } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'teleoperator' | 'viewer';
  status: 'active' | 'invited' | 'inactive';
  lastActive?: string;
  approvals: number;
  avgResponseTime: string;
}

export default function TeamPage() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Try real API first
      const response = await fetch(`${API_BASE}/api/team`, {
        headers: { 'X-Tenant-Id': 'demo-tenant' },
      });

      if (response.ok) {
        const data = await response.json();
        setTeam(data.data || data || []);
        setDemoMode(false);
      } else {
        throw new Error('API unavailable');
      }
    } catch {
      // Fall back to demo mode
      setDemoMode(true);
      try {
        const response = await fetch(`${API_BASE}/api/team`);
        if (response.ok) {
          const data = await response.json();
          setTeam(data);
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

  const getRoleBadgeColor = (role: TeamMember['role']) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-100 text-purple-800';
      case 'teleoperator':
        return 'bg-blue-100 text-blue-800';
      case 'viewer':
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusBadgeColor = (status: TeamMember['status']) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'invited':
        return 'bg-yellow-100 text-yellow-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatLastActive = (lastActive?: string) => {
    if (!lastActive) return '-';

    const date = new Date(lastActive);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;
    return `${Math.floor(diffMins / 1440)} days ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-gray-600">Manage teleoperators and team access</p>
        </div>
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
          <button
            onClick={() => setShowInviteModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <UserPlus className="h-4 w-4" />
            Invite Member
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">Total Members</p>
          <p className="text-2xl font-bold text-gray-900">{team.length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">Active Now</p>
          <p className="text-2xl font-bold text-green-600">
            {team.filter((m) => m.status === 'active').length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">Teleoperators</p>
          <p className="text-2xl font-bold text-blue-600">
            {team.filter((m) => m.role === 'teleoperator').length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">Pending Invites</p>
          <p className="text-2xl font-bold text-yellow-600">
            {team.filter((m) => m.status === 'invited').length}
          </p>
        </div>
      </div>

      {/* Team Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Member
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Approvals
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Avg Response
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Active
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {team.map((member) => (
              <tr key={member.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-medium">
                      {member.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{member.name}</div>
                      <div className="text-sm text-gray-500">{member.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${getRoleBadgeColor(member.role)}`}
                  >
                    {member.role}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(member.status)}`}
                  >
                    {member.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {member.approvals}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {member.avgResponseTime}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatLastActive(member.lastActive)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button className="text-blue-600 hover:text-blue-900 mr-3">Edit</button>
                  <button className="text-red-600 hover:text-red-900">Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Invite Team Member</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="colleague@company.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="teleoperator">Teleoperator</option>
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <p className="text-sm text-gray-500">
                An invitation email will be sent to this address.
              </p>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowInviteModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // In demo mode, just close the modal
                  setShowInviteModal(false);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
