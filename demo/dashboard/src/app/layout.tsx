import type { Metadata } from 'next';
import { Sora } from 'next/font/google';
import './globals.css';

const sora = Sora({ subsets: ['latin'], variable: '--font-sora' });

export const metadata: Metadata = {
  title: 'Dashboard · Todea',
  description:
    'A dashboard that steers client pods sending HTTP and gRPC traffic through a service mesh, then observes the result. Built for the KCD Kuala Lumpur service-mesh demo.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sora.variable}>
      <body className="bg-white text-black font-sora antialiased">{children}</body>
    </html>
  );
}
