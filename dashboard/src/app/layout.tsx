import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Sidebar, RileyChatProvider } from '@/components/layout';
import { AppProvider } from '@/components/providers/AppProvider';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Riley Teleoperator Dashboard',
  description: 'Human oversight dashboard for Riley AI recruiting agent',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <AppProvider>
          <div className="flex h-screen bg-gray-50">
            <Sidebar />
            <main className="flex-1 overflow-auto">{children}</main>
            <RileyChatProvider />
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
