import { useState, useEffect, useCallback } from "react";
import { Check, AlertCircle, ExternalLink, Trash2, ChevronRight, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/client.api";
import { useAuthStore } from "@/store/auth.store";
import { SettingsGroup, SettingsRow } from "../components/SettingsPrimitives";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const AVATAR_GRADIENTS = [
  "from-violet-600 to-fuchsia-500",
  "from-blue-600 to-cyan-500",
  "from-emerald-600 to-teal-500",
  "from-rose-600 to-pink-500",
  "from-amber-600 to-orange-500",
];

function getGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "U").toUpperCase();
}

interface SpotifyStatus {
  connected: boolean;
  clientId?: string;
}

export default function AccountSection() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [status, setStatus] = useState<SpotifyStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const name = user?.name ?? "Guest";
  const initials = getInitials(name);
  const gradient = getGradient(name);

  const fetchStatus = useCallback(() => {
    setChecking(true);
    api
      .get<SpotifyStatus>("/settings/spotify/status")
      .then((r) => setStatus(r))
      .catch(() => setStatus(null))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const spotifyOk = status?.connected ?? false;

  return (
    <div className="pb-4">
      {/* ── Profile ─────────────────────────────────────────── */}
      <motion.button
        whileTap={{ scale: 0.99, opacity: 0.85 }}
        onClick={() => navigate("/profile")}
        className="w-full mb-7 rounded-[20px] overflow-hidden border border-[var(--border)]/30 bg-[var(--bg-surface)] text-left"
      >
        <div className="px-5 py-5 flex items-center gap-4">
          {user?.image_url ? (
            <img
              src={user.image_url}
              alt={name}
              className="w-[64px] h-[64px] rounded-[18px] object-cover shadow-lg flex-shrink-0"
            />
          ) : (
            <div
              className={cn(
                "w-[64px] h-[64px] rounded-[18px] flex items-center justify-center",
                "text-[26px] font-black text-white shadow-lg flex-shrink-0",
                "bg-gradient-to-br",
                gradient
              )}
            >
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[20px] font-bold text-[var(--text-primary)] leading-tight truncate">
              {name}
            </p>
            <p className="text-[14px] text-[var(--text-muted)] truncate">
              {isAuthenticated
                ? user?.email ?? "View profile"
                : "Guest mode — sign in to sync"}
            </p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-[12px] text-green-400 font-semibold">
                Self-hosted · Local
              </span>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-[var(--text-muted)]/40 flex-shrink-0" />
        </div>
      </motion.button>

      {/* ── Spotify status ──────────────────────────────────── */}
      <SettingsGroup
        title="Spotify"
        footer="Spotify credentials live in the server environment (.env or Render dashboard) — they are never sent from this device."
      >
        {/* Status banner */}
        <div
          className={cn(
            "flex items-center gap-2.5 px-4 py-3 text-[13px] font-medium border-b border-[var(--border)]/50",
            spotifyOk
              ? "text-green-400 bg-green-500/5"
              : "text-orange-400 bg-orange-500/5"
          )}
        >
          {spotifyOk ? (
            <Check className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          <span className="flex-1 min-w-0">
            {spotifyOk
              ? `Connected · ${status?.clientId || "credentials set"}`
              : "Not connected"}
          </span>
          <button
            onClick={fetchStatus}
            disabled={checking}
            aria-label="Refresh status"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40"
          >
            <RefreshCw className={cn("w-4 h-4", checking && "animate-spin")} />
          </button>
        </div>

        {!spotifyOk && (
          <div className="px-4 py-4 text-[13px] text-[var(--text-secondary)] leading-relaxed space-y-3">
            <p>
              With Spotify credentials connected you can paste Spotify links
              and get higher-quality artwork. Set these on the server:
            </p>
            <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] px-3.5 py-3 font-mono text-[12px] text-[var(--text-primary)] space-y-1 overflow-x-auto">
              <p>SPOTIFY_CLIENT_ID=...</p>
              <p>SPOTIFY_CLIENT_SECRET=...</p>
            </div>
            <p className="text-[12px] text-[var(--text-muted)]">
              Termux users: add them to <span className="font-mono">api/.env</span>{" "}
              and restart the server. Render users: add them in the dashboard.
            </p>
            <SettingsRow
              label="Spotify setup guide"
              description="github.com/picklem0b/Rheoson"
              onClick={() =>
                window.open(
                  "https://github.com/picklem0b/Rheoson#4--spotify-optional",
                  "_blank"
                )
              }
            >
              <ExternalLink className="w-4 h-4 text-[var(--text-muted)]/40" />
            </SettingsRow>
          </div>
        )}

        {spotifyOk && (
          <SettingsRow
            label="How it's used"
            description="Metadata, artwork, and link resolution only — audio never comes from Spotify"
          >
            <Check className="w-4 h-4 text-green-400" />
          </SettingsRow>
        )}
      </SettingsGroup>

      {/* ── Danger ──────────────────────────────────────────── */}
      <SettingsGroup title="Danger zone">
        <SettingsRow
          label="Clear all app data"
          description="Wipes settings, theme, history, playlists and credentials on this device. Cannot be undone."
          danger
          onClick={() => setConfirmClear(true)}
          icon={<Trash2 className="w-[14px] h-[14px]" />}
          iconBg="#EF4444"
        />
      </SettingsGroup>

      {/* ── Confirm destructive action ──────────────────────── */}
      <Modal open={confirmClear} onClose={() => setConfirmClear(false)} title="Clear all app data?" size="sm">
        <div className="space-y-5">
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            This permanently erases every local setting, theme, playlist
            reference, history, and stored credential on this device. Server
            downloads and your account are not affected.
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setConfirmClear(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              fullWidth
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
            >
              Erase everything
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
