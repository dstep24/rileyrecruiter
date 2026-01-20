'use client';

import { useState, useEffect } from 'react';
import {
  X,
  Key,
  ExternalLink,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface AnthropicApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  isInitialSetup?: boolean;
}

export function AnthropicApiKeyModal({
  isOpen,
  onClose,
  onSuccess,
  isInitialSetup = false,
}: AnthropicApiKeyModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Load existing key on mount
  useEffect(() => {
    if (isOpen) {
      const savedKey = localStorage.getItem('riley_anthropic_api_key');
      if (savedKey) {
        setApiKey(savedKey);
      }
    }
  }, [isOpen]);

  const testApiKey = async () => {
    if (!apiKey.trim()) {
      setTestResult({
        success: false,
        message: 'Please enter an API key',
      });
      return;
    }

    if (!apiKey.startsWith('sk-ant-')) {
      setTestResult({
        success: false,
        message: 'Invalid API key format. Anthropic API keys start with "sk-ant-"',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      // Test the API key by calling our backend endpoint
      const response = await fetch(`${API_BASE}/api/ai/test-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey }),
      });

      if (response.ok) {
        const data = await response.json();
        setTestResult({
          success: true,
          message: data.message || 'API key is valid!',
        });
      } else {
        // If backend test endpoint doesn't exist, just validate format
        setTestResult({
          success: true,
          message: 'API key format is valid. Save to enable AI features.',
        });
      }
    } catch {
      // If backend is unavailable, just validate format
      if (apiKey.startsWith('sk-ant-') && apiKey.length > 20) {
        setTestResult({
          success: true,
          message: 'API key format is valid. Save to enable AI features.',
        });
      } else {
        setTestResult({
          success: false,
          message: 'Invalid API key format',
        });
      }
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setTestResult({
        success: false,
        message: 'Please enter an API key',
      });
      return;
    }

    setSaving(true);

    try {
      // Save to localStorage (in production, this would go to a secure backend)
      localStorage.setItem('riley_anthropic_api_key', apiKey);

      // Also try to save to backend if available
      try {
        await fetch(`${API_BASE}/api/settings/anthropic-key`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey }),
        });
      } catch {
        // Backend save is optional
      }

      setTestResult({
        success: true,
        message: 'API key saved successfully!',
      });

      // Call success callback after a brief delay to show success message
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1000);
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Failed to save API key',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = () => {
    localStorage.removeItem('riley_anthropic_api_key');
    setApiKey('');
    setTestResult({
      success: true,
      message: 'API key removed',
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  {isInitialSetup ? 'Welcome to Riley' : 'Anthropic API Key'}
                </h2>
                <p className="text-sm text-white/80">
                  {isInitialSetup
                    ? 'Set up AI-powered recruiting'
                    : 'Configure your Claude API access'}
                </p>
              </div>
            </div>
            {!isInitialSetup && (
              <button
                onClick={onClose}
                className="p-1 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {isInitialSetup && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                Riley uses Claude AI to power intelligent candidate scoring, personalized outreach,
                and smart search strategies. Enter your Anthropic API key to enable these features.
              </p>
            </div>
          )}

          {/* API Key Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Anthropic API Key
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Key className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestResult(null);
                }}
                placeholder="sk-ant-api03-..."
                className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              >
                {showKey ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Your API key is stored locally and sent to the backend for AI operations.
            </p>
          </div>

          {/* Test Result */}
          {testResult && (
            <div
              className={`flex items-start gap-2 p-3 rounded-lg ${
                testResult.success
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-red-50 border border-red-200'
              }`}
            >
              {testResult.success ? (
                <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <p
                className={`text-sm ${
                  testResult.success ? 'text-green-800' : 'text-red-800'
                }`}
              >
                {testResult.message}
              </p>
            </div>
          )}

          {/* Get API Key Link */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">Don&apos;t have an API key?</span>
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-800 font-medium"
            >
              Get one from Anthropic
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          {/* AI Features Preview */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">AI Features Enabled:</h3>
            <ul className="space-y-2">
              {[
                { label: 'Intelligent Candidate Scoring', desc: 'Analyze seniority, skills, and fit' },
                { label: 'Smart Search Strategies', desc: 'Generate optimized LinkedIn queries' },
                { label: 'Personalized Outreach', desc: 'Create compelling, tailored messages' },
                { label: 'Continuous Learning', desc: 'Improve from feedback over time' },
              ].map((feature, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="text-sm font-medium text-gray-700">{feature.label}</span>
                    <span className="text-xs text-gray-500 ml-1">- {feature.desc}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div>
            {apiKey && !isInitialSetup && (
              <button
                onClick={handleRemove}
                className="text-sm text-red-600 hover:text-red-800"
              >
                Remove API Key
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {isInitialSetup ? (
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm"
              >
                Skip for now
              </button>
            ) : (
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm"
              >
                Cancel
              </button>
            )}
            <button
              onClick={testApiKey}
              disabled={testing || !apiKey.trim()}
              className="px-4 py-2 border border-purple-600 text-purple-600 rounded-lg hover:bg-purple-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
            >
              {testing && <Loader2 className="h-4 w-4 animate-spin" />}
              Test Key
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !apiKey.trim()}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Saving...' : 'Save & Enable AI'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook to check if API key is configured
export function useAnthropicApiKey() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkKey = () => {
      const savedKey = localStorage.getItem('riley_anthropic_api_key');
      setHasKey(!!savedKey);
      setIsChecking(false);
    };

    checkKey();

    // Listen for storage changes (in case key is set in another tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'riley_anthropic_api_key') {
        checkKey();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const refreshKey = () => {
    const savedKey = localStorage.getItem('riley_anthropic_api_key');
    setHasKey(!!savedKey);
  };

  return { hasKey, isChecking, refreshKey };
}

export default AnthropicApiKeyModal;
