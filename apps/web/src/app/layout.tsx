import './global.css';

import { AppShell } from './app-shell';
import { loadViewer } from '../lib/viewer';

export const metadata = {
  title: 'Fantasy Basketball Draft Room',
  description: 'League-specific rankings, auction values, and draft analysis.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await loadViewer().catch(() => null);

  return (
    <html lang="en">
      <body>
        <AppShell viewer={viewer}>{children}</AppShell>
      </body>
    </html>
  );
}
