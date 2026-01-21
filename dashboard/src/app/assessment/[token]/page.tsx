'use client';

import { useState, useEffect, use } from 'react';
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  Send,
  Clock,
  User,
  Building2,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Types matching backend
type QuestionType = 'MULTIPLE_CHOICE' | 'TEXT' | 'YES_NO' | 'SCALE' | 'DATE';

interface Question {
  id: string;
  questionText: string;
  questionType: QuestionType;
  options?: string[];
  isRequired: boolean;
  orderIndex: number;
}

interface AssessmentForm {
  responseId: string;
  templateName: string;
  templateDescription?: string;
  candidateName?: string;
  questions: Question[];
  status: string;
  expiresAt: string;
}

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function AssessmentPage({ params }: PageProps) {
  const { token } = use(params);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<AssessmentForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Track answers
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');

  // Fetch form data on mount
  useEffect(() => {
    async function fetchForm() {
      try {
        const res = await fetch(`${API_BASE}/api/assessments/public/${token}`);
        const data = await res.json();

        if (!data.success) {
          setError(data.error || 'Assessment not found');
          return;
        }

        setForm(data.form);
        setCandidateName(data.form.candidateName || '');
      } catch (err) {
        console.error('Failed to fetch assessment:', err);
        setError('Failed to load assessment. Please try again later.');
      } finally {
        setLoading(false);
      }
    }

    fetchForm();
  }, [token]);

  // Handle answer changes
  const updateAnswer = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  // Check if form is complete
  const isFormComplete = () => {
    if (!form) return false;

    const requiredQuestions = form.questions.filter((q) => q.isRequired);
    return requiredQuestions.every((q) => answers[q.id]?.trim());
  };

  // Submit assessment
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form || !isFormComplete()) return;

    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/api/assessments/public/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: Object.entries(answers).map(([questionId, answerText]) => ({
            questionId,
            answerText,
          })),
          candidateName: candidateName || undefined,
          candidateEmail: candidateEmail || undefined,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || 'Failed to submit assessment');
        return;
      }

      setSubmitted(true);
    } catch (err) {
      console.error('Submit error:', err);
      setError('Failed to submit assessment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Render question based on type
  const renderQuestion = (question: Question) => {
    const value = answers[question.id] || '';

    switch (question.questionType) {
      case 'YES_NO':
        return (
          <div className="flex gap-4">
            {['Yes', 'No'].map((option) => (
              <label
                key={option}
                className={`flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer transition-colors ${
                  value === option
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name={question.id}
                  value={option}
                  checked={value === option}
                  onChange={(e) => updateAnswer(question.id, e.target.value)}
                  className="sr-only"
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        );

      case 'MULTIPLE_CHOICE':
        return (
          <div className="space-y-2">
            {question.options?.map((option) => (
              <label
                key={option}
                className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  value === option
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name={question.id}
                  value={option}
                  checked={value === option}
                  onChange={(e) => updateAnswer(question.id, e.target.value)}
                  className="sr-only"
                />
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    value === option ? 'border-orange-500' : 'border-gray-300'
                  }`}
                >
                  {value === option && (
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                  )}
                </div>
                <span>{option}</span>
              </label>
            ))}
          </div>
        );

      case 'SCALE':
        return (
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => updateAnswer(question.id, String(num))}
                className={`w-10 h-10 rounded-lg border-2 font-medium transition-colors ${
                  value === String(num)
                    ? 'border-orange-500 bg-orange-500 text-white'
                    : 'border-gray-200 hover:border-orange-300'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        );

      case 'DATE':
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => updateAnswer(question.id, e.target.value)}
            className="w-full max-w-xs px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
        );

      case 'TEXT':
      default:
        return (
          <textarea
            value={value}
            onChange={(e) => updateAnswer(question.id, e.target.value)}
            rows={3}
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
            placeholder="Type your answer here..."
          />
        );
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500 mx-auto" />
          <p className="mt-2 text-gray-600">Loading assessment...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !form) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Assessment Unavailable
          </h1>
          <p className="text-gray-600">{error}</p>
          <p className="mt-4 text-sm text-gray-500">
            This assessment may have expired or already been completed.
          </p>
        </div>
      </div>
    );
  }

  // Success state
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Thank You!
          </h1>
          <p className="text-gray-600">
            Your assessment has been submitted successfully. We&apos;ll review your
            responses and get back to you soon.
          </p>
          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              You can close this window now.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Form state
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-8 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-5 h-5" />
              <span className="text-orange-100 text-sm">Riley Recruiter</span>
            </div>
            <h1 className="text-2xl font-bold">{form?.templateName}</h1>
            {form?.templateDescription && (
              <p className="mt-2 text-orange-100">{form.templateDescription}</p>
            )}
          </div>

          {/* Time indicator */}
          <div className="px-6 py-3 bg-orange-50 border-b border-orange-100 flex items-center gap-2 text-sm text-orange-700">
            <Clock className="w-4 h-4" />
            <span>This assessment takes approximately 5-10 minutes</span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Candidate info (optional) */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-gray-400" />
              Your Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={candidateEmail}
                  onChange={(e) => setCandidateEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="your.email@example.com"
                />
              </div>
            </div>
          </div>

          {/* Questions */}
          {form?.questions.map((question, index) => (
            <div key={question.id} className="bg-white rounded-xl shadow-lg p-6">
              <div className="mb-4">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-8 h-8 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-semibold text-sm">
                    {index + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-gray-900 font-medium">
                      {question.questionText}
                      {question.isRequired && (
                        <span className="text-red-500 ml-1">*</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
              <div className="ml-11">{renderQuestion(question)}</div>
            </div>
          ))}

          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {/* Submit button */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <button
              type="submit"
              disabled={!isFormComplete() || submitting}
              className={`w-full py-3 px-6 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors ${
                isFormComplete() && !submitting
                  ? 'bg-orange-500 hover:bg-orange-600 text-white'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Submit Assessment
                </>
              )}
            </button>
            {!isFormComplete() && (
              <p className="text-center text-sm text-gray-500 mt-2">
                Please answer all required questions to submit
              </p>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Powered by Riley Recruiter</p>
        </div>
      </div>
    </div>
  );
}
