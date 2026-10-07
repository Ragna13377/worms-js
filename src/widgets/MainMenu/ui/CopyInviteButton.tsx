import { useEffect, useState } from 'react';
import { useI18n } from '../../../shared/i18n';
import networkStyles from '../../../shared/ui/OnlineStatus.module.css';
import styles from './MainMenu.module.css';

const writeClipboard = (text: string) => navigator.clipboard.writeText(text);

export function CopyInviteButton({
	invite,
	copyText = writeClipboard,
}: {
	invite?: string;
	copyText?: (text: string) => Promise<void>;
}) {
	const { t } = useI18n();
	const [feedback, setFeedback] = useState<'copied' | 'failed'>();
	const [copying, setCopying] = useState(false);
	useEffect(() => {
		if (!feedback) return;
		const timer = setTimeout(() => setFeedback(undefined), 2500);
		return () => clearTimeout(timer);
	}, [feedback]);
	const copy = async () => {
		if (!invite || copying || feedback) return;
		setCopying(true);
		try {
			await copyText(invite);
			setFeedback('copied');
		} catch {
			setFeedback('failed');
		} finally {
			setCopying(false);
		}
	};
	return (
		<button
			type='button'
			className={`${styles.primary} ${styles.copyInvite} ${feedback === 'failed' ? styles.copyFailed : ''}`}
			disabled={!invite || copying || !!feedback}
			onClick={() => void copy()}
		>
			<svg
				viewBox='0 0 32 32'
				aria-hidden='true'
				className={feedback === 'failed' ? networkStyles.poor : undefined}
			>
				{feedback === 'copied' ? (
					<path d='m6 17 7 7L27 8' />
				) : feedback === 'failed' ? (
					<path d='m8 8 16 16M24 8 8 24' />
				) : (
					<>
						<path d='M10 10H5V5h17v5' />
						<rect x='10' y='10' width='17' height='17' rx='2' />
					</>
				)}
			</svg>
			<span className={styles.copyLabel}>
				{(['copyInvite', 'inviteCopied', 'copyInviteError'] as const).map((key) => (
					<span key={key} className={styles.copyMeasure} aria-hidden='true'>
						{t(key)}
					</span>
				))}
				<span aria-live='polite' className={feedback === 'failed' ? networkStyles.poor : undefined}>
					{t(
						feedback === 'failed'
							? 'copyInviteError'
							: feedback === 'copied'
								? 'inviteCopied'
								: 'copyInvite'
					)}
				</span>
			</span>
		</button>
	);
}
