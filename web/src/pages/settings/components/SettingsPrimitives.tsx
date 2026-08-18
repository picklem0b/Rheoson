import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SettingsGroup({
	title,
	children,
	className
}: {
	title?: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn('mb-6', className)}>
			{title && (
				<p className='text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2 px-1'>
					{title}
				</p>
			)}
			<div className='bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] overflow-hidden divide-y divide-[var(--border)]'>
				{children}
			</div>
		</div>
	);
}

export function SettingsRow({
	label,
	description,
	onClick,
	children,
	danger,
	loading
}: {
	label: string;
	description?: string;
	onClick?: () => void;
	children?: React.ReactNode;
	danger?: boolean;
	loading?: boolean;
}) {
	const Tag = onClick ? motion.button : ('div' as any);
	return (
		<Tag
			whileTap={onClick ? { scale: 0.985 } : undefined}
			onClick={loading ? undefined : onClick}
			className={cn(
				'w-full flex items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors',
				onClick &&
					!loading &&
					'active:bg-[var(--bg-elevated)] cursor-pointer',
				loading && 'opacity-50 cursor-not-allowed'
			)}
		>
			<div className='min-w-0 flex-1'>
				<p
					className={cn(
						'text-sm font-semibold leading-snug',
						danger ? 'text-red-400' : 'text-[var(--text-primary)]'
					)}
				>
					{label}
				</p>
				{description && (
					<p className='text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed'>
						{description}
					</p>
				)}
			</div>
			<div className='flex items-center gap-2 flex-shrink-0'>
				{children ??
					(onClick && (
						<ChevronRight className='w-4 h-4 text-[var(--text-muted)]' />
					))}
			</div>
		</Tag>
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
					onClick={() => onChange(o.value)}
				>
					<div
						className={cn(
							'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200',
							value === o.value
								? 'border-[var(--accent)] bg-[var(--accent)]'
								: 'border-[var(--border-strong)]'
						)}
					>
						<AnimatePresence>
							{value === o.value && (
								<motion.div
									initial={{ scale: 0 }}
									animate={{ scale: 1 }}
									exit={{ scale: 0 }}
									className='w-2 h-2 rounded-full bg-white'
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
}
