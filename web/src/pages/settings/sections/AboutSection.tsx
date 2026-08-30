import { useState, useEffect } from "react";
import {
   Music2,
   ExternalLink,
   Github,
   Star,
   GitFork,
   Eye,
   Tag
} from "lucide-react";
import { APP_VERSION } from "@/lib/constants";
import { SettingsGroup, SettingsRow } from "../components/SettingsPrimitives";
import { cn } from "@/lib/utils";

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

const TAGS = ["v1.0.0", "v1.1.0", "v1.2.0", "v1.3.0", "v2.10.0", `v${APP_VERSION}`];

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
               <div
                  className='w-[60px] h-[60px] rounded-[16px] flex items-center justify-center shadow-lg flex-shrink-0'
                  style={{
                     background:
                        "linear-gradient(135deg, var(--accent), var(--accent-bright, var(--accent)))"
                  }}>
                  <Music2 className='w-[28px] h-[28px] text-white' />
               </div>
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

         {/* Release history */}
         <SettingsGroup title='Release history'>
            <div className='px-4 py-4 flex flex-wrap gap-2'>
               {TAGS.map(tag => (
                  <button
                     key={tag}
                     onClick={() =>
                        window.open(`${GITHUB}/releases/tag/${tag}`, "_blank")
                     }
                     className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all duration-150 active:scale-95",
                        tag === `v${APP_VERSION}`
                           ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                           : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--accent)]/60"
                     )}>
                     <Tag className='w-3 h-3' />
                     {tag}
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
                  <ExternalLink className='w-3.5 h-3.5 text-[var(--text-muted)]/35' />
               </SettingsRow>
            ))}
         </SettingsGroup>

         {/* Links */}
         <SettingsGroup title='Links'>
            <SettingsRow
               label='GitHub'
               description='picklem0b/Rheoson — source, issues, discussions'
               onClick={() => window.open(GITHUB, "_blank")}>
               <Github className='w-4 h-4 text-[var(--text-muted)]/60' />
            </SettingsRow>
            <SettingsRow
               label='Changelog'
               onClick={() =>
                  window.open(`${GITHUB}/blob/main/docs/CHANGELOG.md`, "_blank")
               }>
               <ExternalLink className='w-4 h-4 text-[var(--text-muted)]/40' />
            </SettingsRow>
            <SettingsRow
               label='Report a bug'
               onClick={() =>
                  window.open(
                     `${GITHUB}/issues/new?template=bug_report.md`,
                     "_blank"
                  )
               }>
               <ExternalLink className='w-4 h-4 text-[var(--text-muted)]/40' />
            </SettingsRow>
            <SettingsRow
               label='Request a feature'
               onClick={() =>
                  window.open(
                     `${GITHUB}/issues/new?template=feature_request.md`,
                     "_blank"
                  )
               }>
               <ExternalLink className='w-4 h-4 text-[var(--text-muted)]/40' />
            </SettingsRow>
         </SettingsGroup>
      </div>
   );
}
