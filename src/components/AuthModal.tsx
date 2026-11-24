import React, { useState } from 'react';
import { LogOut, ShieldCheck, User as UserIcon, X } from 'lucide-react';
import type { UserDTO } from '../types/rf.ts';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserDTO | null;
  onAuthSuccess: (token: string, user: UserDTO) => void;
  onLogout: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  user,
  onAuthSuccess,
  onLogout,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login' ? { email, password } : { email, name, password };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Authentication failed.');
        return;
      }
      onAuthSuccess(data.token, data.user);
      setEmail('');
      setPassword('');
      setName('');
      onClose();
    } catch {
      setError('Network error while connecting to server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="CoverageLab Account"
    >
      <div className="bg-[#2b2f34] text-slate-100 rounded-md shadow-2xl w-full max-w-md border border-slate-700 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700 bg-[#23272b]">
          <div className="flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-amber-400" />
            <h2 className="text-base font-semibold">
              {user ? 'Operator Profile' : mode === 'login' ? 'Sign In to CoverageLab' : 'Create Operator Account'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1"
            aria-label="Close account modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {user ? (
            <div className="space-y-4">
              <div className="p-4 rounded bg-[#212529] border border-slate-700 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Authenticated PostgreSQL Session</span>
                </div>
                <div className="text-sm">
                  <span className="text-slate-400">Name:</span>{' '}
                  <span className="font-medium text-white">{user.name}</span>
                </div>
                <div className="text-sm">
                  <span className="text-slate-400">Email:</span>{' '}
                  <span className="font-mono text-slate-200">{user.email}</span>
                </div>
                <div className="text-sm">
                  <span className="text-slate-400">Role:</span>{' '}
                  <span className="text-amber-400">{user.role}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onLogout();
                  onClose();
                }}
                className="w-full py-2 px-4 rounded bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="flex rounded bg-[#212529] p-1 border border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                    mode === 'login'
                      ? 'bg-[#373d44] text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                  }}
                  className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                    mode === 'register'
                      ? 'bg-[#373d44] text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Register
                </button>
              </div>

              {mode === 'register' && (
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Operator Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Muhammad Yunus"
                    className="w-full h-9 px-3 text-sm bg-white text-slate-900 rounded border border-slate-300 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@coveragelab.io"
                  className="w-full h-9 px-3 text-sm bg-white text-slate-900 rounded border border-slate-300 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full h-9 px-3 text-sm bg-white text-slate-900 rounded border border-slate-300 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {error && (
                <div className="p-2.5 rounded bg-rose-950/70 border border-rose-700 text-rose-200 text-xs">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 rounded bg-[#1ea853] hover:bg-[#199448] text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {loading
                  ? 'Authenticating...'
                  : mode === 'login'
                  ? 'Sign In'
                  : 'Create Account'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
