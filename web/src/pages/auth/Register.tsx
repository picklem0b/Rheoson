import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { motion } from 'framer-motion';
import { Mail, Lock, User, ArrowRight, Music } from 'lucide-react';
import './auth.css';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const { register, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    try {
      await register(email, password, name || undefined);
      navigate('/');
    } catch (err: any) {
      const detail = err?.detail || err?.message || 'Registration failed';
      setError(detail);
    }
  };

  const handleGuestSkip = () => {
    navigate('/');
  };

  return (
    <div className="auth-page">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 25 }}
        className="auth-form"
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent)] flex items-center justify-center">
            <Music className="w-7 h-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black text-[var(--text-primary)]">Create account</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">Start your music journey</p>
          </div>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-4"
          >
            <p className="text-sm text-red-400 font-medium">{error}</p>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Display name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="auth-input pl-10"
            />
          </div>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="auth-input pl-10"
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="password"
              placeholder="Password (min 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              className="auth-input pl-10"
            />
          </div>

          <motion.button
            type="submit"
            disabled={isLoading}
            whileTap={{ scale: 0.98 }}
            className="auth-button w-full"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating account…
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                Create account
                <ArrowRight className="w-4 h-4" />
              </span>
            )}
          </motion.button>
        </form>

        <div className="mt-6 text-center space-y-3">
          <p className="text-sm text-[var(--text-muted)]">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-[var(--accent)] hover:underline">
              Sign in
            </Link>
          </p>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--border)]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-[var(--bg-base)] text-[var(--text-muted)]">or</span>
            </div>
          </div>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleGuestSkip}
            className="w-full py-2.5 rounded-xl border border-[var(--border)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            Continue as guest
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
