import { useState, useEffect } from "react";
import { ArrowSquareOut, GithubLogo, Star, GitFork, Eye, GitPullRequest } from '@phosphor-icons/react';
import AppLogo from "@/components/ui/AppLogo";
import { APP_VERSION } from "@/lib/constants";
import { SettingsGroup, SettingsRow } from "../components/SettingsPrimitives";
import { GitHubStarButton } from "@/components/New-Components/cards/github-star";

const GITHUB = "https://github.com/picklem0b/Rheoson";

const STACK: { label: string; value: string; url: string }[] = [
   {
      label: "yt-dlp",
      value: "2026.3.17",
      url: "https://github.com/yt-dlp/yt-dlp"
   },
   {
      label: "ytmusicapi",
      value: "1.12.0",
      url: "https://github.com/sigma67/ytmusicapi"
   },
   { label: "FastAPI", value: "0.103+", url: "https://fastapi.tiangolo.com" },
   { label: "React", value: "18.3", url: "https://react.dev" },
   {
      label: "Framer Motion",
      value: "11",
      url: "https://www.framer.com/motion"
   },
   { label: "Howler.js", value: "2.2.4", url: "https://howlerjs.com" },
   { label: "Zustand", value: "4.5", url: "https://github.com/pmndrs/zustand" },
   { label: "Tailwind CSS", value: "3.4", url: "https://tailwindcss.com" },
   { label: "TanStack Query", value: "5", url: "https://tanstack.com/query" },
   { label: "Capacitor", value: "6", url: "https://capacitorjs.com" }
];

/**
 * A few entries from docs/CHANGELOG.md, newest first. The section is a
 * reader for the file — the file stays the single source of truth (the
 * workflow feeds it from release tags), and the full history is one tap
 * away on GitHub.
 */
const CHANGELOG_HIGHLIGHTS: { tag: string; note: string }[] = [
   { tag: `v${APP_VERSION}`, note: "Playback settings sheet: speed, repeat, shuffle, playthrough; Playing from label; queue dedupe; Like became Favourite." },
   { tag: "v2.21.0", note: "Home rebuilt: Last played, Recommended artists, Trending this week, Made for you." },
   { tag: "v2.21.2", note: "Library-wide search, honest empty states, playlist cards with provenance." },
   { tag: "v2.20.5", note: "Unhandled server failures navigate to the error page, with the DCCNN code in the info panel." },
   { tag: "v2.20.3", note: "Every failure carries a stable five-character DCCNN error code that traces to its exact raise site." },
];

export default function AboutSection() {
   const [stats, setStats] = useState<{
      stars: number;
      forks: number;
      watchers: number;
   } | null>(null);

   useEffect(() => {
      fetch("https://api.github.com/repos/picklem0b/Rheoson")
         .then(r => r.json())
         .then(d =>
            setStats({
               stars: d.stargazers_count ?? 0,
               forks: d.forks_count ?? 0,
               watchers: d.watchers_count ?? 0
            })
         )
         .catch(() => {});
   }, []);

   return (
      <div className='pb-4'>
         {/* App card */}
         <div className='mb-7 rounded-[20px] overflow-hidden border border-[var(--border)]/30 bg-[var(--bg-surface)]'>
            <div className='px-5 py-5 flex items-center gap-4'>
               <AppLogo size='3xl' glow />
               <div>
                  <p className='text-[22px] font-bold text-[var(--text-primary)] leading-tight'>
                     Rheoson
                  </p>
                  <p className='text-[14px] text-[var(--text-muted)]'>
                     v{APP_VERSION} · picklem0b
                  </p>
                  <p className='text-[12px] text-[var(--text-muted)] mt-0.5'>
                     Termux · Render · Self-hosted
                  </p>
               </div>
            </div>

            {stats && (
               <div className='flex border-t border-[var(--border)]/50 divide-x divide-[var(--border)]/50'>
                  {[
                     { Icon: Star, label: "Stars", v: stats.stars },
                     { Icon: GitFork, label: "Forks", v: stats.forks },
                     { Icon: Eye, label: "Watchers", v: stats.watchers }
                  ].map(({ Icon, label, v }) => (
                     <div
                        key={label}
                        className='flex-1 flex flex-col items-center py-4 gap-1'>
                        <Icon className='w-4 h-4 text-[var(--accent)]' />
                        <span className='text-[17px] font-bold text-[var(--text-primary)] tabular-nums'>
                           {v}
                        </span>
                        <span className='text-[11px] text-[var(--text-muted)]'>
                           {label}
                        </span>
                     </div>
                  ))}
               </div>
            )}
         </div>

         {/* Community — shared star button from the UI kit, plus contributing */}
         <SettingsGroup
            title='Community'
            footer='Rheoson is open source. A star helps other people find it.'>
            <div className='px-4 py-4 flex items-center justify-center gap-3 flex-wrap'>
               <GitHubStarButton
                  owner='picklem0b'
                  repo='Rheoson'
                  className='rounded-2xl'
               />
               <button
                  onClick={() => window.open(`${GITHUB}/blob/main/docs/CONTRIBUTING.md`, "_blank")}
                  className='flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--accent)]/50 active:scale-[0.98] transition-all'>
                  <GitPullRequest className='w-4 h-4 text-[var(--accent)]' />
                  Contributing
               </button>
            </div>
         </SettingsGroup>

         {/* Changelog — real entries from docs/CHANGELOG.md, replacing the tag-chip strip */}
         <SettingsGroup
            title='Changelog'
            footer='Every phase since v2.19 is written up in docs/CHANGELOG.md — this is the short version.'>
            <div className='px-4 py-3'>
               {CHANGELOG_HIGHLIGHTS.map(e => (
                  <button
                     key={e.tag}
                     onClick={() => window.open(`${GITHUB}/blob/main/docs/CHANGELOG.md`, "_blank")}
                     className='w-full text-left py-2.5 border-b border-[var(--border)]/40 last:border-0 group'>
                     <span className='text-[12px] font-bold text-[var(--accent)] font-mono'>{e.tag}</span>
                     <p className='text-[13px] text-[var(--text-secondary)] leading-snug mt-0.5 group-hover:text-[var(--text-primary)] transition-colors'>
                        {e.note}
                     </p>
                  </button>
               ))}
            </div>
         </SettingsGroup>

         {/* Stack */}
         <SettingsGroup title='Built with'>
            {STACK.map(d => (
               <SettingsRow
                  key={d.label}
                  label={d.label}
                  onClick={() => window.open(d.url, "_blank")}>
                  <span className='text-[13px] text-[var(--text-muted)] font-mono'>
                     {d.value}
                  </span>
                  <ArrowSquareOut className='w-3.5 h-3.5 text-[var(--text-muted)]/35' />
               </SettingsRow>
            ))}
         </SettingsGroup>

         {/* Links */}
         <SettingsGroup title='Links'>
            <SettingsRow
               label='GitHub'
               description='picklem0b/Rheoson — source, issues, discussions'
               onClick={() => window.open(GITHUB, "_blank")}>
               <GithubLogo className='w-4 h-4 text-[var(--text-muted)]/60' />
            </SettingsRow>
            <SettingsRow
               label='Changelog'
               onClick={() =>
                  window.open(`${GITHUB}/blob/main/docs/CHANGELOG.md`, "_blank")
               }>
               <ArrowSquareOut className='w-4 h-4 text-[var(--text-muted)]/40' />
            </SettingsRow>
            <SettingsRow
               label='Report a bug'
               onClick={() =>
                  window.open(
                     `${GITHUB}/issues/new?template=bug_report.md`,
                     "_blank"
                  )
               }>
               <ArrowSquareOut className='w-4 h-4 text-[var(--text-muted)]/40' />
            </SettingsRow>
            <SettingsRow
               label='Request a feature'
               onClick={() =>
                  window.open(
                     `${GITHUB}/issues/new?template=feature_request.md`,
                     "_blank"
                  )
               }>
               <ArrowSquareOut className='w-4 h-4 text-[var(--text-muted)]/40' />
            </SettingsRow>
         </SettingsGroup>
      </div>
   );
}
