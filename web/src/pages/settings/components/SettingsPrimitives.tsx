import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const SPRING = {
   type: "spring" as const,
   damping: 22,
   stiffness: 380,
   mass: 0.6
};

// ── SettingsGroup ─────────────────────────────────────────────

export function SettingsGroup({
   title,
   footer,
   children,
   className
}: {
   title?: string;
   footer?: string;
   children: React.ReactNode;
   className?: string;
}) {
   return (
      <div className={cn("mb-7", className)}>
         {title && (
            <p className='text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2 px-1'>
               {title}
            </p>
         )}
         <div className='bg-[var(--bg-surface)] rounded-[18px] overflow-hidden divide-y divide-[var(--border)]/50 border border-[var(--border)]/30'>
            {children}
         </div>
         {footer && (
            <p className='text-[11px] text-[var(--text-muted)] mt-2 px-1 leading-relaxed'>
               {footer}
            </p>
         )}
      </div>
   );
}

export function SettingsRow({
   label,
   description,
   onClick,
   children,
   danger,
   loading,
   icon,
   iconBg
}: {
   label: string;
   description?: string;
   onClick?: () => void;
   children?: React.ReactNode;
   danger?: boolean;
   loading?: boolean;
   icon?: React.ReactNode;
   iconBg?: string;
}) {
   const clickable = Boolean(onClick && !loading);

   return (
      <motion.div
         role={clickable ? "button" : undefined}
         tabIndex={clickable ? 0 : undefined}
         whileTap={clickable ? { opacity: 0.55 } : undefined}
         transition={SPRING}
         onClick={loading ? undefined : onClick}
         className={cn(
            "w-full flex items-center gap-3 px-4 text-left select-none",
            description ? "py-3" : "py-[13px]",
            clickable && "cursor-pointer active:bg-[var(--bg-elevated)]",
            loading && "opacity-40 cursor-not-allowed"
         )}>
         {icon && (
            <div
               className='w-[30px] h-[30px] rounded-[8px] flex items-center justify-center flex-shrink-0 text-white'
               style={{ background: iconBg ?? "var(--accent)" }}>
               {icon}
            </div>
         )}
         <div className='min-w-0 flex-1'>
            <p
               className={cn(
                  "text-[15px] leading-snug",
                  danger
                     ? "text-red-400 font-normal"
                     : "text-[var(--text-primary)] font-[440]"
               )}>
               {label}
            </p>
            {description && (
               <p className='text-[13px] text-[var(--text-muted)] mt-[2px] leading-snug'>
                  {description}
               </p>
            )}
         </div>
         <div className='flex items-center gap-2 flex-shrink-0'>
            {children}
            {!children && clickable && (
               <ChevronRight className='w-[18px] h-[18px] text-[var(--text-muted)]/40' />
            )}
         </div>
      </motion.div>
   );
}

export function Toggle({
	value,
	onChange,
	disabled
}: {
	value: boolean;
	onChange: (v: boolean) => void;
	disabled?: boolean;
}) {
	return (
		<motion.button
			onClick={() => !disabled && onChange(!value)}
			className={cn(
				'relative w-12 h-6.5 rounded-full flex-shrink-0 transition-colors duration-300',
				value ? 'bg-[var(--accent)]' : 'bg-[var(--bg-overlay)]',
				disabled && 'opacity-40 cursor-not-allowed'
			)}
			style={{ height: '26px', width: '46px' }}
		>
			<motion.div
				animate={{ x: value ? 22 : 2 }}
				transition={{ type: 'spring', damping: 22, stiffness: 380 }}
				className='absolute top-[3px] w-[20px] h-[20px] rounded-full bg-white shadow-sm'
			/>
		</motion.button>
	);
   value,
   onChange,
   disabled
}: {
   value: boolean;
   onChange: (v: boolean) => void;
   disabled?: boolean;
}) {
   return (
      <motion.button
         onPointerDown={() => !disabled && onChange(!value)}
         whileTap={{ scale: 0.94 }}
         transition={SPRING}
         role='switch'
         aria-checked={value}
         style={{ width: 51, height: 31 }}
         className={cn(
            "relative flex-shrink-0 rounded-full transition-colors duration-200",
            value ? "bg-[var(--accent)]" : "bg-[var(--bg-overlay)]",
            disabled && "opacity-40 cursor-not-allowed"
         )}>
         <motion.div
            animate={{ x: value ? 22 : 2 }}
            transition={{ type: "spring", damping: 22, stiffness: 400 }}
            className='absolute top-[3px] w-[25px] h-[25px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.28)]'
         />
      </motion.button>
   );
}

export function RadioGroup<T extends string>({
   options,
   value,
   onChange
}: {
   options: { value: T; label: string; sub?: string }[];
   value: T;
   onChange: (v: T) => void;
}) {
   return (
      <>
         {options.map(o => (
            <SettingsRow
               key={o.value}
               label={o.label}
               description={o.sub}
               onClick={() => onChange(o.value)}>
               <div
                  className={cn(
                     "w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors duration-150",
                     value === o.value
                        ? "border-[var(--accent)]"
                        : "border-[var(--text-muted)]/25"
                  )}>
                  <AnimatePresence>
                     {value === o.value && (
                        <motion.div
                           initial={{ scale: 0 }}
                           animate={{ scale: 1 }}
                           exit={{ scale: 0 }}
                           transition={{
                              type: "spring",
                              damping: 18,
                              stiffness: 420
                           }}
                           className='w-[12px] h-[12px] rounded-full bg-[var(--accent)]'
                        />
                     )}
                  </AnimatePresence>
               </div>
            </SettingsRow>
         ))}
      </>
   );
}

export function Slider({
	value,
	onChange,
	min = 0,
	max = 1,
	step = 0.01,
	label,
	formatValue
}: {
	value: number;
	onChange: (v: number) => void;
	min?: number;
	max?: number;
	step?: number;
	label?: string;
	formatValue?: (v: number) => string;
}) {
	const pct = ((value - min) / (max - min)) * 100;

	return (
		<div className='px-4 py-3.5'>
			{label && (
				<div className='flex items-center justify-between mb-3'>
					<span className='text-xs text-[var(--text-muted)]'>
						{label}
					</span>
					<span className='text-xs font-bold text-[var(--text-primary)]'>
						{formatValue
							? formatValue(value)
							: `${Math.round(pct)}%`}
					</span>
				</div>
			)}
			<div className='relative flex items-center h-6'>
				<div className='w-full h-1.5 rounded-full bg-[var(--bg-overlay)] overflow-hidden'>
					<div
						className='h-full bg-[var(--accent)] rounded-full'
						style={{ width: `${pct}%`, transition: 'width 0.05s' }}
					/>
				</div>
				<input
					type='range'
					min={min}
					max={max}
					step={step}
					value={value}
					onChange={e => onChange(parseFloat(e.target.value))}
					className='absolute inset-0 w-full opacity-0 cursor-pointer h-6'
				/>
				<div
					className='absolute w-5 h-5 rounded-full bg-white shadow-md border border-[var(--border)] pointer-events-none'
					style={{
						left: `calc(${pct}% - 10px)`,
						transition: 'left 0.05s'
					}}
				/>
			</div>
		</div>
	);
}

export function StatusBadge({
	ok,
	labelOk,
	labelErr
}: {
	ok: boolean;
	labelOk: string;
	labelErr: string;
}) {
	return (
		<div
			className={cn(
				'flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-semibold border',
				ok
					? 'bg-green-500/10 text-green-400 border-green-500/20'
					: 'bg-orange-500/10 text-orange-400 border-orange-500/20'
			)}
		>
			<div
				className={cn(
					'w-1.5 h-1.5 rounded-full',
					ok ? 'bg-green-400' : 'bg-orange-400'
				)}
			/>
			{ok ? labelOk : labelErr}
		</div>
	);
   value,
   onChange,
   min = 0,
   max = 1,
   step = 0.01,
   label,
   formatValue
}: {
   value: number;
   onChange: (v: number) => void;
   min?: number;
   max?: number;
   step?: number;
   label?: string;
   formatValue?: (v: number) => string;
}) {
   const pct = Math.round(((value - min) / (max - min)) * 100);

   return (
      <div className='px-4 py-4'>
         {label && (
            <div className='flex items-center justify-between mb-3'>
               <span className='text-[13px] text-[var(--text-muted)]'>
                  {label}
               </span>
               <span className='text-[13px] font-semibold text-[var(--text-primary)] tabular-nums'>
                  {formatValue ? formatValue(value) : `${pct}%`}
               </span>
            </div>
         )}
         <div className='relative' style={{ height: 28 }}>
            {/* Track background */}
            <div className='absolute inset-0 flex items-center pointer-events-none'>
               <div className='w-full h-[5px] rounded-full overflow-hidden bg-[var(--bg-overlay)]'>
                  <div
                     className='h-full rounded-full bg-[var(--accent)]'
                     style={{ width: `${pct}%` }}
                  />
               </div>
            </div>
            {/* Thumb */}
            <div
               className='absolute top-0 w-[28px] h-[28px] rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.22)] border border-black/5 pointer-events-none'
               style={{ left: `calc(${pct}% - 14px)` }}
            />
            {/* Native input on top — invisible */}
            <input
               type='range'
               min={min}
               max={max}
               step={step}
               value={value}
               onChange={e => onChange(parseFloat(e.target.value))}
               className='absolute inset-0 w-full opacity-0 cursor-pointer'
               style={{ height: 28 }}
            />
         </div>
      </div>
   );
}

// ── Stepper ───────────────────────────────────────────────────

export function Stepper({
   value,
   onChange,
   min = 1,
   max = 16
}: {
   value: number;
   onChange: (v: number) => void;
   min?: number;
   max?: number;
}) {
   return (
      <div className='flex items-center gap-3'>
         <motion.button
            whileTap={{ scale: 0.85 }}
            transition={SPRING}
            onClick={() => onChange(Math.max(min, value - 1))}
            disabled={value <= min}
            className='w-8 h-8 rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center text-[var(--text-primary)] text-lg font-medium leading-none disabled:opacity-30'>
            −
         </motion.button>
         <span className='text-[15px] font-semibold text-[var(--text-primary)] tabular-nums w-5 text-center'>
            {value}
         </span>
         <motion.button
            whileTap={{ scale: 0.85 }}
            transition={SPRING}
            onClick={() => onChange(Math.min(max, value + 1))}
            disabled={value >= max}
            className='w-8 h-8 rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center text-[var(--text-primary)] text-lg font-medium leading-none disabled:opacity-30'>
            +
         </motion.button>
      </div>
   );
}

// ── ValueBadge ────────────────────────────────────────────────

export function ValueBadge({ label }: { label: string }) {
   return (
      <span className='text-[14px] text-[var(--text-muted)] font-normal'>
         {label}
      </span>
   );
}

// ── ActionRow ─────────────────────────────────────────────────
// Row that shows loading → ok → err state with icon feedback

export type ActionState = "idle" | "loading" | "ok" | "err";

export function actionRunner(
   setter: (s: ActionState) => void,
   fn: () => Promise<void>
) {
   return async () => {
      setter("loading");
      try {
         await fn();
         setter("ok");
      } catch {
         setter("err");
      }
      setTimeout(() => setter("idle"), 3000);
   };
}
