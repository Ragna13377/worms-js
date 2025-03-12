import type { Metadata } from 'next';
import { PT_Sans } from 'next/font/google';
import StyledComponentsRegistry from '@shared/lib/registry';
import '@app/styles/globals.scss';

const ptSans = PT_Sans({
	variable: '--font-pt-sans',
	subsets: ['latin'],
	weight: ['400', '700'],
	display: 'swap',
});

export const metadata: Metadata = {
	title: 'Worms JS',
	description: 'Classic Worms on Next.js',
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang='en'>
			<body className={`${ptSans.variable} antialiased h-dvh w-dvw`}>
				<StyledComponentsRegistry>{children}</StyledComponentsRegistry>
			</body>
		</html>
	);
}
