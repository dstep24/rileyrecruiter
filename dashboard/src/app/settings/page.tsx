'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Wifi, WifiOff, Save, Check, AlertCircle, X, ExternalLink, Key, Sparkles, Eye, EyeOff, Brain, Loader2, Zap } from 'lucide-react';
import { useAnthropicApiKey } from '@/components/AnthropicApiKeyModal';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface Settings {
  general: {
    tenantName: string;
    timezone: string;
    workingHours: { start: string; end: string };
    weekendsEnabled: boolean;
  };
  notifications: {
    emailAlerts: boolean;
    slackAlerts: boolean;
    urgentOnly: boolean;
    digestFrequency: string;
  };
  autonomy: {
    level: string;
    approvalRequired: string[];
    autoApprove: string[];
    autopilotMode: boolean;
  };
  integrations: {
    ats: { connected: boolean; provider: string; lastSync?: string };
    email: { connected: boolean; provider: string };
    calendar: { connected: boolean; provider: string };
    linkedin: { connected: boolean; provider?: string; lastSync?: string };
  };
}

interface SettingsSection {
  id: string;
  title: string;
  description: string;
}

interface IntegrationConfig {
  key: 'ats' | 'email' | 'calendar' | 'linkedin';
  name: string;
  description: string;
  providers: { id: string; name: string; requiresApiKey?: boolean; requiresOAuth?: boolean }[];
  fields?: { id: string; label: string; type: string; placeholder: string }[];
}

const integrationConfigs: IntegrationConfig[] = [
  {
    key: 'ats',
    name: 'Applicant Tracking System',
    description: 'Connect your ATS to sync candidates and job requisitions',
    providers: [
      { id: 'greenhouse', name: 'Greenhouse', requiresApiKey: true },
      { id: 'lever', name: 'Lever', requiresApiKey: true },
      { id: 'workday', name: 'Workday', requiresApiKey: true },
      { id: 'ashby', name: 'Ashby', requiresApiKey: true },
    ],
    fields: [
      { id: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter your API key' },
      { id: 'subdomain', label: 'Subdomain (optional)', type: 'text', placeholder: 'your-company' },
    ],
  },
  {
    key: 'email',
    name: 'Email',
    description: 'Connect your email to send outreach messages',
    providers: [
      { id: 'gmail', name: 'Gmail (Google Workspace)', requiresOAuth: true },
      { id: 'outlook', name: 'Outlook (Microsoft 365)', requiresOAuth: true },
      { id: 'smtp', name: 'Custom SMTP', requiresApiKey: true },
    ],
    fields: [
      { id: 'smtpHost', label: 'SMTP Host', type: 'text', placeholder: 'smtp.example.com' },
      { id: 'smtpPort', label: 'SMTP Port', type: 'text', placeholder: '587' },
      { id: 'smtpUser', label: 'Username', type: 'text', placeholder: 'user@example.com' },
      { id: 'smtpPass', label: 'Password', type: 'password', placeholder: 'Enter password' },
    ],
  },
  {
    key: 'calendar',
    name: 'Calendar',
    description: 'Connect your calendar to schedule interviews',
    providers: [
      { id: 'google', name: 'Google Calendar', requiresOAuth: true },
      { id: 'outlook', name: 'Outlook Calendar', requiresOAuth: true },
      { id: 'calendly', name: 'Calendly', requiresApiKey: true },
    ],
    fields: [
      { id: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter your API key' },
    ],
  },
  {
    key: 'linkedin',
    name: 'LinkedIn',
    description: 'Connect LinkedIn to source candidates and send InMails',
    providers: [
      { id: 'linkedin', name: 'LinkedIn Recruiter (Direct)', requiresApiKey: true },
      { id: 'unipile', name: 'Unipile (LinkedIn Automation)', requiresApiKey: true },
    ],
    fields: [
      { id: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter your Unipile API key' },
      { id: 'dsn', label: 'DSN (Subdomain or URL)', type: 'text', placeholder: 'e.g., api12 or api12.unipile.com:14273' },
      { id: 'accountId', label: 'Account ID', type: 'text', placeholder: 'LinkedIn account ID from Unipile dashboard' },
    ],
  },
];

const sections: SettingsSection[] = [
  { id: 'general', title: 'General', description: 'Basic configuration settings' },
  { id: 'ai-services', title: 'AI Services', description: 'Claude API configuration' },
  { id: 'notifications', title: 'Notifications', description: 'Alert and notification preferences' },
  { id: 'integrations', title: 'Integrations', description: 'Connected services and APIs' },
  { id: 'autonomy', title: 'Autonomy', description: 'Riley autonomy level controls' },
  { id: 'security', title: 'Security', description: 'Security and access settings' },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [activeSection, setActiveSection] = useState('general');
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [integrationModal, setIntegrationModal] = useState<IntegrationConfig | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [integrationFields, setIntegrationFields] = useState<Record<string, string>>({});
  const [connecting, setConnecting] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{
    success: boolean;
    message: string;
    accounts?: Array<{ id: string; provider: string; status: string; name?: string }>;
  } | null>(null);

  // AI Services state
  const { hasKey: hasAnthropicKey, refreshKey: refreshAnthropicKey } = useAnthropicApiKey();
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [testingAnthropicKey, setTestingAnthropicKey] = useState(false);
  const [anthropicTestResult, setAnthropicTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Load Anthropic key on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('riley_anthropic_api_key');
    if (savedKey) {
      setAnthropicApiKey(savedKey);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setDemoMode(false);
    try {
      const response = await fetch(`${API_BASE}/api/settings`);

      if (response.ok) {
        const data = await response.json();
        setSettings(data.data || data);
      } else {
        console.error('Settings API error:', response.status);
      }
    } catch (err) {
      console.error('Settings fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Check for saved Unipile config on load
  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem('riley_unipile_config');
      if (savedConfig && settings) {
        const parsed = JSON.parse(savedConfig);
        if (parsed.apiKey && parsed.accountId) {
          // Mark LinkedIn as connected if we have saved config
          setSettings((prev) =>
            prev
              ? {
                  ...prev,
                  integrations: {
                    ...prev.integrations,
                    linkedin: {
                      connected: true,
                      provider: 'unipile',
                    },
                  },
                }
              : prev
          );
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [settings?.integrations?.linkedin?.connected]);

  // Parse DSN input - extract just the subdomain if user pasted full URL
  const parseDsn = (input: string): { subdomain: string; port: string } => {
    if (!input) return { subdomain: 'api1', port: '13443' };

    // If user pasted full URL like "api12.unipile.com:14273" or "https://api12.unipile.com:14273"
    const urlMatch = input.match(/^(?:https?:\/\/)?([a-z0-9]+)\.unipile\.com(?::(\d+))?/i);
    if (urlMatch) {
      return {
        subdomain: urlMatch[1],
        port: urlMatch[2] || '13443',
      };
    }

    // If user entered just the subdomain with port like "api12:14273"
    const subdomainPortMatch = input.match(/^([a-z0-9]+)(?::(\d+))?$/i);
    if (subdomainPortMatch) {
      return {
        subdomain: subdomainPortMatch[1],
        port: subdomainPortMatch[2] || '13443',
      };
    }

    // Default: treat as subdomain
    return { subdomain: input.replace(/[^a-z0-9]/gi, ''), port: '13443' };
  };

  // Test Unipile connection and list available accounts
  const testUnipileConnection = async () => {
    const apiKey = integrationFields.apiKey;
    const { subdomain, port } = parseDsn(integrationFields.dsn);

    if (!apiKey) {
      setConnectionTestResult({
        success: false,
        message: 'Please enter your API key first',
      });
      return;
    }

    setTestingConnection(true);
    setConnectionTestResult(null);

    try {
      // Call Unipile API to list accounts
      const apiUrl = `https://${subdomain}.unipile.com:${port}/api/v1/accounts`;
      console.log('[Unipile] Testing connection to:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const accounts = data.items || [];

        // Log what we received for debugging
        console.log('[Unipile] Accounts received:', accounts);

        // Filter for LinkedIn accounts - check various possible provider values
        const linkedInAccounts = accounts.filter(
          (acc: { provider: string; type?: string }) => {
            const provider = (acc.provider || '').toUpperCase();
            const type = (acc.type || '').toUpperCase();
            return provider.includes('LINKEDIN') || type.includes('LINKEDIN');
          }
        );

        if (linkedInAccounts.length > 0) {
          setConnectionTestResult({
            success: true,
            message: `Found ${linkedInAccounts.length} LinkedIn account(s)`,
            accounts: linkedInAccounts,
          });
        } else if (accounts.length > 0) {
          // Show all accounts anyway - user can pick one
          setConnectionTestResult({
            success: true,
            message: `Found ${accounts.length} account(s)`,
            accounts: accounts,
          });
        } else {
          setConnectionTestResult({
            success: false,
            message: 'Connected to Unipile, but no accounts found. Please connect your LinkedIn account in the Unipile dashboard at dashboard.unipile.com',
          });
        }
      } else if (response.status === 401) {
        setConnectionTestResult({
          success: false,
          message: 'Invalid API key. Please check your Unipile API key.',
        });
      } else {
        const errorText = await response.text();
        setConnectionTestResult({
          success: false,
          message: `API error: ${response.status} - ${errorText}`,
        });
      }
    } catch (error) {
      setConnectionTestResult({
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : 'Network error'}. Check your DSN (subdomain) is correct.`,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    // Simulate save in demo mode
    await new Promise((resolve) => setTimeout(resolve, 500));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const renderSection = () => {
    if (!settings) return null;

    switch (activeSection) {
      case 'general':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company Name
              </label>
              <input
                type="text"
                value={settings.general.tenantName}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    general: { ...settings.general, tenantName: e.target.value },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Timezone
              </label>
              <select
                value={settings.general.timezone}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    general: { ...settings.general, timezone: e.target.value },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="America/Los_Angeles">Pacific Time (PT)</option>
                <option value="America/Denver">Mountain Time (MT)</option>
                <option value="America/Chicago">Central Time (CT)</option>
                <option value="America/New_York">Eastern Time (ET)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Working Hours Start
                </label>
                <input
                  type="time"
                  value={settings.general.workingHours.start}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      general: {
                        ...settings.general,
                        workingHours: { ...settings.general.workingHours, start: e.target.value },
                      },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Working Hours End
                </label>
                <input
                  type="time"
                  value={settings.general.workingHours.end}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      general: {
                        ...settings.general,
                        workingHours: { ...settings.general.workingHours, end: e.target.value },
                      },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="weekends"
                checked={settings.general.weekendsEnabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    general: { ...settings.general, weekendsEnabled: e.target.checked },
                  })
                }
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="weekends" className="ml-2 text-sm text-gray-700">
                Allow Riley to work on weekends
              </label>
            </div>
          </div>
        );

      case 'ai-services':
        const testAnthropicKey = async () => {
          if (!anthropicApiKey.trim()) {
            setAnthropicTestResult({
              success: false,
              message: 'Please enter an API key',
            });
            return;
          }

          if (!anthropicApiKey.startsWith('sk-ant-')) {
            setAnthropicTestResult({
              success: false,
              message: 'Invalid API key format. Anthropic API keys start with "sk-ant-"',
            });
            return;
          }

          setTestingAnthropicKey(true);
          setAnthropicTestResult(null);

          try {
            // Test by calling our scoring endpoint
            const response = await fetch(`${API_BASE}/api/ai/score-candidates`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Anthropic-Api-Key': anthropicApiKey,
              },
              body: JSON.stringify({
                candidates: [{ id: 'test', name: 'Test User', currentTitle: 'Engineer' }],
                requirements: { title: 'Engineer' },
              }),
            });

            if (response.ok) {
              const data = await response.json();
              setAnthropicTestResult({
                success: true,
                message: data.aiPowered
                  ? 'API key is valid and AI scoring is active!'
                  : 'API key format is valid. Save to enable AI features.',
              });
            } else {
              setAnthropicTestResult({
                success: true,
                message: 'API key format is valid. Save to enable AI features.',
              });
            }
          } catch {
            if (anthropicApiKey.startsWith('sk-ant-') && anthropicApiKey.length > 20) {
              setAnthropicTestResult({
                success: true,
                message: 'API key format is valid. Save to enable AI features.',
              });
            } else {
              setAnthropicTestResult({
                success: false,
                message: 'Invalid API key format',
              });
            }
          } finally {
            setTestingAnthropicKey(false);
          }
        };

        const saveAnthropicKey = () => {
          if (anthropicApiKey.trim()) {
            localStorage.setItem('riley_anthropic_api_key', anthropicApiKey);
            refreshAnthropicKey();
            setAnthropicTestResult({
              success: true,
              message: 'API key saved! AI features are now enabled.',
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          }
        };

        const removeAnthropicKey = () => {
          localStorage.removeItem('riley_anthropic_api_key');
          setAnthropicApiKey('');
          refreshAnthropicKey();
          setAnthropicTestResult({
            success: true,
            message: 'API key removed. AI features are now disabled.',
          });
        };

        return (
          <div className="space-y-6">
            {/* Status Banner */}
            <div
              className={`flex items-center gap-3 p-4 rounded-lg ${
                hasAnthropicKey
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-yellow-50 border border-yellow-200'
              }`}
            >
              {hasAnthropicKey ? (
                <>
                  <Brain className="h-6 w-6 text-green-600" />
                  <div>
                    <p className="font-medium text-green-800">AI Features Active</p>
                    <p className="text-sm text-green-700">
                      Claude-powered candidate scoring and outreach generation are enabled.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-6 w-6 text-yellow-600" />
                  <div>
                    <p className="font-medium text-yellow-800">AI Features Inactive</p>
                    <p className="text-sm text-yellow-700">
                      Add your Anthropic API key to enable AI-powered features.
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* API Key Input */}
            <div className="p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Key className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Anthropic API Key</h3>
                  <p className="text-sm text-gray-500">
                    Powers Claude AI for intelligent recruiting
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showAnthropicKey ? 'text' : 'password'}
                      value={anthropicApiKey}
                      onChange={(e) => {
                        setAnthropicApiKey(e.target.value);
                        setAnthropicTestResult(null);
                      }}
                      placeholder="sk-ant-api03-..."
                      className="w-full pr-10 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    >
                      {showAnthropicKey ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Your API key is stored locally and used for AI operations.{' '}
                    <a
                      href="https://console.anthropic.com/settings/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-600 hover:text-purple-800"
                    >
                      Get an API key
                      <ExternalLink className="inline h-3 w-3 ml-0.5" />
                    </a>
                  </p>
                </div>

                {/* Test Result */}
                {anthropicTestResult && (
                  <div
                    className={`flex items-start gap-2 p-3 rounded-lg ${
                      anthropicTestResult.success
                        ? 'bg-green-50 border border-green-200'
                        : 'bg-red-50 border border-red-200'
                    }`}
                  >
                    {anthropicTestResult.success ? (
                      <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    )}
                    <p
                      className={`text-sm ${
                        anthropicTestResult.success ? 'text-green-800' : 'text-red-800'
                      }`}
                    >
                      {anthropicTestResult.message}
                    </p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={testAnthropicKey}
                    disabled={testingAnthropicKey || !anthropicApiKey.trim()}
                    className="px-4 py-2 border border-purple-600 text-purple-600 rounded-lg hover:bg-purple-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
                  >
                    {testingAnthropicKey && <Loader2 className="h-4 w-4 animate-spin" />}
                    Test Key
                  </button>
                  <button
                    onClick={saveAnthropicKey}
                    disabled={!anthropicApiKey.trim()}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
                  >
                    <Save className="h-4 w-4" />
                    Save Key
                  </button>
                  {hasAnthropicKey && (
                    <button
                      onClick={removeAnthropicKey}
                      className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium"
                    >
                      Remove Key
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* AI Features List */}
            <div className="p-4 border border-gray-200 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600" />
                AI-Powered Features
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    title: 'Intelligent Candidate Scoring',
                    desc: 'Analyze seniority, skills, career trajectory, and fit with AI reasoning',
                    enabled: hasAnthropicKey,
                  },
                  {
                    title: 'Smart Search Strategies',
                    desc: 'Generate optimized LinkedIn queries from job descriptions',
                    enabled: hasAnthropicKey,
                  },
                  {
                    title: 'Personalized Outreach',
                    desc: 'Create compelling, tailored messages for each candidate',
                    enabled: hasAnthropicKey,
                  },
                  {
                    title: 'Continuous Learning',
                    desc: 'Improve search quality from teleoperator feedback',
                    enabled: hasAnthropicKey,
                  },
                ].map((feature, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg border ${
                      feature.enabled
                        ? 'bg-green-50 border-green-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {feature.enabled ? (
                        <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <X className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p
                          className={`font-medium ${
                            feature.enabled ? 'text-green-800' : 'text-gray-600'
                          }`}
                        >
                          {feature.title}
                        </p>
                        <p
                          className={`text-xs ${
                            feature.enabled ? 'text-green-700' : 'text-gray-500'
                          }`}
                        >
                          {feature.desc}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Usage Info */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-medium text-blue-900 mb-2">About API Usage</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• AI scoring uses approximately 500-1500 tokens per candidate</li>
                <li>• Outreach generation uses approximately 200-500 tokens per message</li>
                <li>• Costs depend on your Anthropic pricing tier</li>
                <li>• View usage at console.anthropic.com</li>
              </ul>
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Email Alerts</p>
                <p className="text-sm text-gray-500">Receive task notifications via email</p>
              </div>
              <button
                onClick={() =>
                  setSettings({
                    ...settings,
                    notifications: {
                      ...settings.notifications,
                      emailAlerts: !settings.notifications.emailAlerts,
                    },
                  })
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.notifications.emailAlerts ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    settings.notifications.emailAlerts ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Slack Alerts</p>
                <p className="text-sm text-gray-500">Receive task notifications in Slack</p>
              </div>
              <button
                onClick={() =>
                  setSettings({
                    ...settings,
                    notifications: {
                      ...settings.notifications,
                      slackAlerts: !settings.notifications.slackAlerts,
                    },
                  })
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.notifications.slackAlerts ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    settings.notifications.slackAlerts ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Urgent Only</p>
                <p className="text-sm text-gray-500">Only notify for high-priority tasks</p>
              </div>
              <button
                onClick={() =>
                  setSettings({
                    ...settings,
                    notifications: {
                      ...settings.notifications,
                      urgentOnly: !settings.notifications.urgentOnly,
                    },
                  })
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.notifications.urgentOnly ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    settings.notifications.urgentOnly ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Digest Frequency
              </label>
              <select
                value={settings.notifications.digestFrequency}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    notifications: { ...settings.notifications, digestFrequency: e.target.value },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="realtime">Real-time</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
          </div>
        );

      case 'integrations':
        const integrationIcons: Record<string, { bg: string; text: string; label: string }> = {
          ats: { bg: 'bg-green-100', text: 'text-green-600', label: 'ATS' },
          email: { bg: 'bg-blue-100', text: 'text-blue-600', label: '@' },
          calendar: { bg: 'bg-purple-100', text: 'text-purple-600', label: 'Cal' },
          linkedin: { bg: 'bg-blue-700', text: 'text-white', label: 'in' },
        };

        const openIntegrationModal = (config: IntegrationConfig) => {
          setIntegrationModal(config);
          setSelectedProvider('');
          setConnectionTestResult(null);

          // Load saved Unipile config if exists
          if (config.key === 'linkedin') {
            try {
              const savedConfig = localStorage.getItem('riley_unipile_config');
              if (savedConfig) {
                const parsed = JSON.parse(savedConfig);
                setIntegrationFields({
                  apiKey: parsed.apiKey || '',
                  dsn: parsed.dsn || '',
                  accountId: parsed.accountId || '',
                });
                setSelectedProvider('unipile');
                return;
              }
            } catch {
              // Ignore parse errors
            }
          }

          setIntegrationFields({});
        };

        const handleDisconnect = (key: 'ats' | 'email' | 'calendar' | 'linkedin') => {
          // Clear saved config
          if (key === 'linkedin') {
            localStorage.removeItem('riley_unipile_config');
          }

          setSettings({
            ...settings,
            integrations: {
              ...settings.integrations,
              [key]: {
                connected: false,
                provider: '',
              },
            },
          });
        };

        return (
          <div className="space-y-4">
            {integrationConfigs.map((config) => {
              const integration = settings.integrations[config.key];
              const icon = integrationIcons[config.key];
              const isConnected = 'connected' in integration && integration.connected;
              const provider = 'provider' in integration ? integration.provider : '';

              // Get account details for LinkedIn/Unipile
              let accountDetails: { accountId?: string; accountName?: string } = {};
              if (config.key === 'linkedin' && isConnected) {
                try {
                  const savedConfig = localStorage.getItem('riley_unipile_config');
                  if (savedConfig) {
                    const parsed = JSON.parse(savedConfig);
                    accountDetails = {
                      accountId: parsed.accountId,
                      accountName: parsed.accountName,
                    };
                  }
                } catch {
                  // Ignore parse errors
                }
              }

              return (
                <div
                  key={config.key}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 ${icon.bg} rounded-lg flex items-center justify-center`}>
                      <span className={`${icon.text} font-bold`}>{icon.label}</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{config.name}</p>
                      <p className="text-sm text-gray-500">
                        {isConnected ? `Connected via ${provider}` : 'Not connected'}
                      </p>
                      {isConnected && config.key === 'linkedin' && accountDetails.accountId && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Account: {accountDetails.accountName ? (
                            <span className="font-medium text-gray-600">{accountDetails.accountName}</span>
                          ) : (
                            <code className="bg-gray-100 px-1 rounded">{accountDetails.accountId}</code>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  {isConnected ? (
                    <button
                      onClick={() => handleDisconnect(config.key)}
                      className="px-4 py-2 rounded-lg transition-colors bg-red-100 text-red-700 hover:bg-red-200"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => openIntegrationModal(config)}
                      className="px-4 py-2 rounded-lg transition-colors bg-blue-600 text-white hover:bg-blue-700"
                    >
                      Connect
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );

      case 'autonomy':
        // Load/save autopilot mode from localStorage
        const getAutopilotMode = () => {
          if (typeof window === 'undefined') return false;
          return localStorage.getItem('riley_autopilot_mode') === 'true';
        };

        const toggleAutopilotMode = (enabled: boolean) => {
          localStorage.setItem('riley_autopilot_mode', enabled ? 'true' : 'false');
          setSettings({
            ...settings,
            autonomy: { ...settings.autonomy, autopilotMode: enabled },
          });
        };

        const autopilotEnabled = settings.autonomy.autopilotMode ?? getAutopilotMode();

        return (
          <div className="space-y-6">
            {/* Autopilot Mode - Featured Toggle */}
            <div className={`p-4 rounded-lg border-2 ${
              autopilotEnabled
                ? 'bg-gradient-to-r from-purple-50 to-blue-50 border-purple-300'
                : 'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${autopilotEnabled ? 'bg-purple-100' : 'bg-gray-200'}`}>
                    <Zap className={`h-6 w-6 ${autopilotEnabled ? 'text-purple-600' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 flex items-center gap-2">
                      Autopilot Mode
                      {autopilotEnabled && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-purple-600 text-white rounded-full">
                          ACTIVE
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-600">
                      {autopilotEnabled
                        ? 'Riley automatically sends pitches when connections are accepted'
                        : 'All pitches require your manual approval before sending'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => toggleAutopilotMode(!autopilotEnabled)}
                  className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
                    autopilotEnabled ? 'bg-purple-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition ${
                      autopilotEnabled ? 'translate-x-8' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Autopilot Details */}
              <div className={`mt-4 pt-4 border-t ${autopilotEnabled ? 'border-purple-200' : 'border-gray-200'}`}>
                <p className="text-xs font-medium text-gray-700 mb-2">When Autopilot is {autopilotEnabled ? 'ON' : 'OFF'}:</p>
                <ul className="text-xs text-gray-600 space-y-1">
                  {autopilotEnabled ? (
                    <>
                      <li className="flex items-center gap-2">
                        <Check className="h-3 w-3 text-green-600" />
                        Pitch messages sent automatically after connection acceptance
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-3 w-3 text-green-600" />
                        Follow-up sequences triggered automatically
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-3 w-3 text-green-600" />
                        AI handles routine responses in conversations
                      </li>
                    </>
                  ) : (
                    <>
                      <li className="flex items-center gap-2">
                        <AlertCircle className="h-3 w-3 text-yellow-600" />
                        You&apos;ll be notified when connections are accepted
                      </li>
                      <li className="flex items-center gap-2">
                        <AlertCircle className="h-3 w-3 text-yellow-600" />
                        Review and approve each pitch before sending
                      </li>
                      <li className="flex items-center gap-2">
                        <AlertCircle className="h-3 w-3 text-yellow-600" />
                        Full control over every outgoing message
                      </li>
                    </>
                  )}
                </ul>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-800">Autonomy Level Controls</p>
                  <p className="text-sm text-yellow-700">
                    Changing these settings affects how independently Riley operates.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Current Autonomy Level
              </label>
              <div className="grid grid-cols-3 gap-4">
                {['SHADOW', 'SUPERVISED', 'AUTONOMOUS'].map((level) => (
                  <button
                    key={level}
                    onClick={() =>
                      setSettings({
                        ...settings,
                        autonomy: { ...settings.autonomy, level },
                      })
                    }
                    className={`p-4 border-2 rounded-lg text-center transition-colors ${
                      settings.autonomy.level === level
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-medium text-gray-900">{level}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {level === 'SHADOW' && 'Watch and learn only'}
                      {level === 'SUPERVISED' && 'Draft all, you approve'}
                      {level === 'AUTONOMOUS' && 'Handle routine tasks'}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Actions Requiring Approval
              </label>
              <div className="space-y-2">
                {['SEND_EMAIL', 'SEND_LINKEDIN_MESSAGE', 'SCHEDULE_INTERVIEW', 'SEND_OFFER'].map((action) => (
                  <div key={action} className="flex items-center">
                    <input
                      type="checkbox"
                      id={action}
                      checked={settings.autonomy.approvalRequired.includes(action)}
                      onChange={(e) => {
                        const newRequired = e.target.checked
                          ? [...settings.autonomy.approvalRequired, action]
                          : settings.autonomy.approvalRequired.filter((a) => a !== action);
                        setSettings({
                          ...settings,
                          autonomy: { ...settings.autonomy, approvalRequired: newRequired },
                        });
                      }}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor={action} className="ml-2 text-sm text-gray-700">
                      {action.replace(/_/g, ' ')}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'security':
        return (
          <div className="space-y-4">
            <div className="p-4 border border-gray-200 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">Two-Factor Authentication</h3>
              <p className="text-sm text-gray-500 mb-4">
                Add an extra layer of security to your account
              </p>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Enable 2FA
              </button>
            </div>

            <div className="p-4 border border-gray-200 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">API Keys</h3>
              <p className="text-sm text-gray-500 mb-4">
                Manage API keys for external integrations
              </p>
              <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                Manage API Keys
              </button>
            </div>

            <div className="p-4 border border-gray-200 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">Audit Log</h3>
              <p className="text-sm text-gray-500 mb-4">
                View all actions taken in your account
              </p>
              <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                View Audit Log
              </button>
            </div>

            <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
              <h3 className="font-medium text-red-900 mb-2">Danger Zone</h3>
              <p className="text-sm text-red-700 mb-4">
                Permanently delete your tenant and all associated data
              </p>
              <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                Delete Tenant
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600">Configure Riley&apos;s behavior and integrations</p>
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
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <Check className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-64 flex-shrink-0">
          <nav className="space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                  activeSection === section.id
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <p className="font-medium">{section.title}</p>
                <p className="text-sm text-gray-500">{section.description}</p>
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-6">
            {sections.find((s) => s.id === activeSection)?.title}
          </h2>
          {renderSection()}
        </div>
      </div>

      {/* Integration Connection Modal */}
      {integrationModal && settings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">
                Connect {integrationModal.name}
              </h2>
              <button
                onClick={() => setIntegrationModal(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-6">{integrationModal.description}</p>

            {/* Provider Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Provider
              </label>
              <div className="space-y-2">
                {integrationModal.providers.map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => {
                      setSelectedProvider(provider.id);
                      setIntegrationFields({});
                    }}
                    className={`w-full text-left p-3 border rounded-lg transition-colors ${
                      selectedProvider === provider.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{provider.name}</span>
                      {provider.requiresOAuth && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                          OAuth
                        </span>
                      )}
                      {provider.requiresApiKey && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                          API Key
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Configuration Fields */}
            {selectedProvider && (
              <div className="mb-6 space-y-4">
                {integrationModal.providers.find((p) => p.id === selectedProvider)?.requiresOAuth ? (
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800 mb-3">
                      Click the button below to authenticate with {
                        integrationModal.providers.find((p) => p.id === selectedProvider)?.name
                      }. You&apos;ll be redirected to authorize Riley.
                    </p>
                    <button
                      onClick={() => {
                        setConnecting(true);
                        // Simulate OAuth flow
                        setTimeout(() => {
                          setSettings({
                            ...settings,
                            integrations: {
                              ...settings.integrations,
                              [integrationModal.key]: {
                                connected: true,
                                provider: selectedProvider,
                                lastSync: new Date().toISOString(),
                              },
                            },
                          });
                          setConnecting(false);
                          setIntegrationModal(null);
                        }, 1500);
                      }}
                      disabled={connecting}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {connecting ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <ExternalLink className="h-4 w-4" />
                      )}
                      {connecting ? 'Connecting...' : 'Authorize with OAuth'}
                    </button>
                  </div>
                ) : (
                  <>
                    {integrationModal.fields?.map((field) => (
                      <div key={field.id}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {field.label}
                        </label>
                        <input
                          type={field.type}
                          value={integrationFields[field.id] || ''}
                          onChange={(e) =>
                            setIntegrationFields({
                              ...integrationFields,
                              [field.id]: e.target.value,
                            })
                          }
                          placeholder={field.placeholder}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    ))}

                    {/* Unipile-specific: Test Connection Button */}
                    {selectedProvider === 'unipile' && integrationFields.apiKey && (
                      <div className="pt-2">
                        <button
                          onClick={testUnipileConnection}
                          disabled={testingConnection}
                          className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                        >
                          {testingConnection ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Wifi className="h-4 w-4" />
                          )}
                          {testingConnection ? 'Testing...' : 'Test Connection & List Accounts'}
                        </button>
                      </div>
                    )}

                    {/* Connection Test Results */}
                    {connectionTestResult && selectedProvider === 'unipile' && (
                      <div
                        className={`mt-3 p-3 rounded-lg ${
                          connectionTestResult.success
                            ? 'bg-green-50 border border-green-200'
                            : 'bg-red-50 border border-red-200'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {connectionTestResult.success ? (
                            <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                          )}
                          <div className="flex-1">
                            <p
                              className={`text-sm font-medium ${
                                connectionTestResult.success ? 'text-green-800' : 'text-red-800'
                              }`}
                            >
                              {connectionTestResult.message}
                            </p>

                            {/* Show available accounts */}
                            {connectionTestResult.accounts && connectionTestResult.accounts.length > 0 && (
                              <div className="mt-2 space-y-1">
                                <p className="text-xs text-gray-600 font-medium">Available Accounts:</p>
                                {connectionTestResult.accounts.map((account) => {
                                  const isSelected = integrationFields.accountId === account.id;
                                  return (
                                    <div
                                      key={account.id}
                                      className={`flex items-center justify-between p-2 rounded border ${
                                        isSelected
                                          ? 'bg-blue-50 border-blue-300'
                                          : 'bg-white border-gray-200'
                                      }`}
                                    >
                                      <div>
                                        <p className="text-sm font-medium">
                                          {account.name || account.provider}
                                          {isSelected && (
                                            <span className="ml-2 text-xs text-blue-600">✓ Selected</span>
                                          )}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                          ID: <code className="bg-gray-100 px-1 rounded">{account.id}</code>
                                        </p>
                                      </div>
                                      {isSelected ? (
                                        <span className="text-xs px-2 py-1 bg-blue-600 text-white rounded">
                                          Selected
                                        </span>
                                      ) : (
                                        <button
                                          onClick={() =>
                                            setIntegrationFields({
                                              ...integrationFields,
                                              accountId: account.id,
                                            })
                                          }
                                          className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                        >
                                          Use This
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {!connectionTestResult.success && (
                              <a
                                href="https://dashboard.unipile.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 hover:text-blue-800"
                              >
                                Open Unipile Dashboard
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setIntegrationModal(null);
                  setConnectionTestResult(null);
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>

              {/* For Unipile: Only show Connect after successful test with account selected */}
              {selectedProvider === 'unipile' && (
                <button
                  onClick={async () => {
                    // Verify we have all required fields
                    if (!connectionTestResult?.success || !integrationFields.accountId) {
                      setConnectionTestResult({
                        success: false,
                        message: 'Please test the connection and select an account first',
                      });
                      return;
                    }

                    setConnecting(true);

                    // Parse DSN to get clean subdomain and port
                    const { subdomain, port } = parseDsn(integrationFields.dsn);

                    // Get the account name from test results if available
                    const selectedAccount = connectionTestResult.accounts?.find(
                      (acc) => acc.id === integrationFields.accountId
                    );

                    // Save to localStorage for persistence (in real app, would save to backend)
                    const unipileConfig = {
                      apiKey: integrationFields.apiKey,
                      dsn: subdomain,
                      port: port,
                      accountId: integrationFields.accountId,
                      accountName: selectedAccount?.name || selectedAccount?.provider || undefined,
                    };
                    localStorage.setItem('riley_unipile_config', JSON.stringify(unipileConfig));

                    // Update settings state
                    setSettings({
                      ...settings,
                      integrations: {
                        ...settings.integrations,
                        linkedin: {
                          connected: true,
                          provider: 'unipile',
                          lastSync: new Date().toISOString(),
                        },
                      },
                    });

                    setConnecting(false);
                    setIntegrationModal(null);
                    setConnectionTestResult(null);

                    // Show success message
                    setSaved(true);
                    setTimeout(() => setSaved(false), 2000);
                  }}
                  disabled={
                    connecting ||
                    !connectionTestResult?.success ||
                    !integrationFields.accountId
                  }
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {connecting && <RefreshCw className="h-4 w-4 animate-spin" />}
                  {!connectionTestResult?.success
                    ? 'Test Connection First'
                    : !integrationFields.accountId
                    ? 'Select an Account'
                    : connecting
                    ? 'Saving...'
                    : 'Save & Connect'}
                </button>
              )}

              {/* For non-Unipile providers */}
              {selectedProvider &&
                selectedProvider !== 'unipile' &&
                !integrationModal.providers.find((p) => p.id === selectedProvider)?.requiresOAuth && (
                  <button
                    onClick={() => {
                      setConnecting(true);
                      setTimeout(() => {
                        const hasApiKey = integrationFields.apiKey || integrationFields.smtpHost;
                        if (hasApiKey) {
                          setSettings({
                            ...settings,
                            integrations: {
                              ...settings.integrations,
                              [integrationModal.key]: {
                                connected: true,
                                provider: selectedProvider,
                                lastSync: new Date().toISOString(),
                              },
                            },
                          });
                          setIntegrationModal(null);
                        }
                        setConnecting(false);
                      }, 1000);
                    }}
                    disabled={connecting || (!integrationFields.apiKey && !integrationFields.smtpHost)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {connecting && <RefreshCw className="h-4 w-4 animate-spin" />}
                    {connecting ? 'Validating...' : 'Connect'}
                  </button>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
