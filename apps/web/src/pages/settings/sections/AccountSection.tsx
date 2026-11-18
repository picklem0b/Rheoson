import { useState, useEffect, useCallback } from "react";
import { Check, WarningCircle, ArrowSquareOut, Trash, CaretRight, ArrowClockwise, UserCircle } from '@phosphor-icons/react';
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/client.api";
import { useAuthStore } from "@/store/auth.store";
import { isClerkEnabled } from "@/lib/constants";
import UserAvatar from "@/components/ui/UserAvatar";
import {
  SettingsGroup,
  SettingsRow,
  ActionState,
  actionRunner
} from "../components/SettingsPrimitives";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface SpotifyStatus {
  connected: boolean;
  clientId?: string;
}

/**
 * Account — identity and credentials, and nothing else.
 *
 * Personalisation (theme, nav, fonts) lives in Appearance; history controls
 * and backups live in Privacy. Anything about the account itself is here:
 * the profile header, Clerk's account manager (profile fields, password,
 * sessions — via the <UserProfile /> modal), Spotify connection status and
 * the destructive device wipe.
 */
export default function AccountSection() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [status, setStatus] = useState<SpotifyStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [signOutState, setSignOutState] = useState<ActionState>("idle");

  /** Sign out of this device only — same semantics Privacy's row had:
   *  drops the local session token, reloads, server data untouched. */
  const signOutDevice = actionRunner(setSignOutState, async () => {
    localStorage.removeItem("rheoson-auth");
    sessionStorage.removeItem("rheoson-last-search");
    window.location.reload();
  });

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
  const clerk = isClerkEnabled();

  return (
    <div className="pb-4">
      {/* ── Profile ─────────────────────────────────────────── */}
      <motion.button
        whileTap={{ scale: 0.99, opacity: 0.85 }}
        onClick={() => navigate("/profile")}
        className="w-full mb-7 rounded-[20px] overflow-hidden border border-[var(--border)]/30 bg-[var(--bg-surface)] text-left"
      >
        <div className="px-5 py-5 flex items-center gap-4">
          <UserAvatar size="xl" shape="rounded" interactive={false} />
          <div className="min-w-0 flex-1">
            <p className="text-[20px] font-bold text-[var(--text-primary)] leading-tight truncate">
              {user?.username ?? "Your account"}
            </p>
            <p className="text-[14px] text-[var(--text-muted)] truncate">
              {user?.email ?? "View profile"}
            </p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
              <span className="text-[12px] text-[var(--success-text)] font-semibold">
                Self-hosted · Local
              </span>
            </div>
          </div>
          <CaretRight className="w-5 h-5 text-[var(--text-muted)]/40 flex-shrink-0" />
        </div>
      </motion.button>

      {/* ── Manage account (Clerk) ──────────────────────────── */}
      {clerk && (
        <SettingsGroup
          title="Account management"
          footer="Profile details, email address, password and active sessions — managed by Clerk, your identity provider."
        >
          <SettingsRow
            label="Manage account"
            description="Edit profile, change password, review sessions"
            icon={<UserCircle className="w-[14px] h-[14px]" />}
            iconBg="var(--accent)"
            onClick={() => navigate("/account")}
          >
            <CaretRight className="w-4 h-4 text-[var(--text-muted)]/40" />
          </SettingsRow>
        </SettingsGroup>
      )}

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
              ? "text-[var(--success-text)] bg-[var(--success-bg)]"
              : "text-orange-400 bg-orange-500/5"
          )}
        >
          {spotifyOk ? (
            <Check className="w-4 h-4 flex-shrink-0" />
          ) : (
            <WarningCircle className="w-4 h-4 flex-shrink-0" />
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
            <ArrowClockwise className={cn("w-4 h-4", checking && "animate-spin")} />
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
              <ArrowSquareOut className="w-4 h-4 text-[var(--text-muted)]/40" />
            </SettingsRow>
          </div>
        )}

        {spotifyOk && (
          <SettingsRow
            label="How it's used"
            description="Metadata, artwork, and link resolution only — audio never comes from Spotify"
          >
            <Check className="w-4 h-4 text-[var(--success-text)]" />
          </SettingsRow>
        )}
      </SettingsGroup>

      {/* ── Session ─────────────────────────────────────────── */}
      <SettingsGroup
        title="Session"
        footer="Sign out of this device only. Your account, likes, playlists and downloads on the server are untouched — signing back in restores everything."
      >
        <SettingsRow
          label="Sign out of this device"
          description="Clears the session token from this device and reloads the app"
          danger
          onClick={signOutState === "idle" ? signOutDevice : undefined}
          icon={<ArrowClockwise className="w-[14px] h-[14px]" />}
          iconBg="var(--danger)"
        />
      </SettingsGroup>

      {/* ── Danger ──────────────────────────────────────────── */}
      <SettingsGroup title="Danger zone">
        <SettingsRow
          label="Clear all app data"
          description="Wipes settings, theme, history, playlists and credentials on this device. Cannot be undone."
          danger
          onClick={() => setConfirmClear(true)}
          icon={<Trash className="w-[14px] h-[14px]" />}
          iconBg="var(--danger)"
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
