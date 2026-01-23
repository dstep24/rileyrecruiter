'use client';

import { useEffect, useState } from 'react';
import {
  X,
  Loader2,
  Coffee,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Send,
  Clock,
  Users,
} from 'lucide-react';
import {
  formatTimeRemaining,
  formatDuration,
  estimateBatchTime,
  getDailyStats,
  type HumanLikeTimingConfig,
  type DailyOutreachStats,
} from '@/lib/humanLikeTiming';

export interface OutreachProgress {
  current: number;
  total: number;
  status: 'waiting' | 'sending' | 'break' | 'complete' | 'cancelled' | 'error';
  statusMessage: string;
  remainingMs: number;
  isBreak: boolean;
  successCount: number;
  failureCount: number;
  currentCandidateName?: string;
  errors: Array<{ candidateName: string; error: string }>;
}

interface OutreachProgressModalProps {
  isOpen: boolean;
  progress: OutreachProgress;
  config: HumanLikeTimingConfig;
  outreachType: 'connection' | 'inmail' | 'message';
  onCancel: () => void;
  onClose: () => void;
}

export function OutreachProgressModal({
  isOpen,
  progress,
  config,
  outreachType,
  onCancel,
  onClose,
}: OutreachProgressModalProps) {
  const [dailyStats, setDailyStats] = useState<DailyOutreachStats>(getDailyStats());

  // Update daily stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setDailyStats(getDailyStats());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!isOpen) return null;

  const percentComplete = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  const isActive = progress.status === 'waiting' || progress.status === 'sending' || progress.status === 'break';
  const isComplete = progress.status === 'complete';
  const isCancelled = progress.status === 'cancelled';
  const isError = progress.status === 'error';

  // Calculate estimated remaining time
  const remainingMessages = progress.total - progress.current;
  const estimatedTime = remainingMessages > 0
    ? estimateBatchTime(remainingMessages, config)
    : null;

  // Get daily limit info
  const getDailyLimit = () => {
    switch (outreachType) {
      case 'connection':
        return {
          sent: dailyStats.connectionsSent,
          limit: config.dailyConnectionLimit,
          label: 'connections',
        };
      case 'inmail':
        return {
          sent: dailyStats.inMailsSent,
          limit: config.dailyInMailLimit,
          label: 'InMails',
        };
      case 'message':
        return {
          sent: dailyStats.messagesSent,
          limit: config.dailyMessageLimit,
          label: 'messages',
        };
    }
  };

  const dailyLimit = getDailyLimit();
  const dailyLimitWarning = dailyLimit.sent >= dailyLimit.limit * 0.8;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 ${
          isComplete ? 'bg-green-50' :
          isCancelled ? 'bg-yellow-50' :
          isError ? 'bg-red-50' :
          'bg-blue-50'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isActive && progress.isBreak ? (
                <Coffee className="h-6 w-6 text-amber-600 animate-pulse" />
              ) : isActive ? (
                <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
              ) : isComplete ? (
                <CheckCircle className="h-6 w-6 text-green-600" />
              ) : isCancelled ? (
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              ) : (
                <XCircle className="h-6 w-6 text-red-600" />
              )}
              <h3 className="text-lg font-semibold text-gray-900">
                {isActive ? 'Sending Outreach' :
                 isComplete ? 'Outreach Complete' :
                 isCancelled ? 'Outreach Cancelled' :
                 'Outreach Error'}
              </h3>
            </div>
            {!isActive && (
              <button
                onClick={onClose}
                className="p-1 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            )}
          </div>
        </div>

        {/* Progress Section */}
        <div className="px-6 py-4">
          {/* Current Status */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
              <span>
                {progress.currentCandidateName
                  ? `Sending to ${progress.currentCandidateName}...`
                  : progress.statusMessage}
              </span>
              <span className="font-medium">
                {progress.current} / {progress.total}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  isComplete ? 'bg-green-500' :
                  isCancelled ? 'bg-yellow-500' :
                  isError ? 'bg-red-500' :
                  progress.isBreak ? 'bg-amber-500' :
                  'bg-blue-500'
                }`}
                style={{ width: `${percentComplete}%` }}
              />
            </div>
          </div>

          {/* Timer Display */}
          {isActive && progress.remainingMs > 0 && (
            <div className={`text-center py-4 rounded-lg mb-4 ${
              progress.isBreak ? 'bg-amber-50' : 'bg-blue-50'
            }`}>
              <div className="flex items-center justify-center gap-2 mb-1">
                {progress.isBreak ? (
                  <Coffee className="h-4 w-4 text-amber-600" />
                ) : (
                  <Clock className="h-4 w-4 text-blue-600" />
                )}
                <span className={`text-sm font-medium ${
                  progress.isBreak ? 'text-amber-700' : 'text-blue-700'
                }`}>
                  {progress.isBreak ? 'Taking a break' : 'Next message in'}
                </span>
              </div>
              <div className={`text-3xl font-bold ${
                progress.isBreak ? 'text-amber-600' : 'text-blue-600'
              }`}>
                {formatTimeRemaining(progress.remainingMs)}
              </div>
              {progress.isBreak && (
                <p className="text-xs text-amber-600 mt-1">
                  Mimicking human behavior to stay safe
                </p>
              )}
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-xl font-bold text-green-600">
                {progress.successCount}
              </div>
              <div className="text-xs text-green-700">Sent</div>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="text-xl font-bold text-red-600">
                {progress.failureCount}
              </div>
              <div className="text-xs text-red-700">Failed</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-xl font-bold text-gray-600">
                {progress.total - progress.current}
              </div>
              <div className="text-xs text-gray-700">Remaining</div>
            </div>
          </div>

          {/* Estimated Time Remaining */}
          {isActive && estimatedTime && remainingMessages > 0 && (
            <div className="text-center text-sm text-gray-500 mb-4">
              Estimated time remaining: {formatDuration(estimatedTime.avgMs)}
            </div>
          )}

          {/* Daily Limit Warning */}
          <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 ${
            dailyLimitWarning ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'
          }`}>
            <Users className={`h-4 w-4 ${dailyLimitWarning ? 'text-yellow-600' : 'text-gray-500'}`} />
            <span className={`text-sm ${dailyLimitWarning ? 'text-yellow-700' : 'text-gray-600'}`}>
              Daily limit: <strong>{dailyLimit.sent}/{dailyLimit.limit}</strong> {dailyLimit.label} sent today
            </span>
            {dailyLimitWarning && (
              <AlertTriangle className="h-4 w-4 text-yellow-500 ml-auto" />
            )}
          </div>

          {/* Errors List */}
          {progress.errors.length > 0 && (
            <div className="mb-4">
              <div className="text-sm font-medium text-red-700 mb-2">
                Failed to send ({progress.errors.length}):
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {progress.errors.map((err, idx) => (
                  <div key={idx} className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                    {err.candidateName}: {err.error}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            {isActive ? (
              <button
                onClick={onCancel}
                className="flex-1 py-2.5 px-4 bg-red-100 text-red-700 rounded-lg font-medium hover:bg-red-200 transition-colors flex items-center justify-center gap-2"
              >
                <XCircle className="h-4 w-4" />
                Cancel
              </button>
            ) : (
              <button
                onClick={onClose}
                className="flex-1 py-2.5 px-4 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            )}
          </div>

          {/* Human-like timing notice */}
          {isActive && (
            <p className="text-xs text-gray-400 text-center mt-4">
              <Send className="h-3 w-3 inline mr-1" />
              Using human-like timing to protect your LinkedIn account
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default OutreachProgressModal;
