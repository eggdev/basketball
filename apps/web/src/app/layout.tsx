import './global.css';
import { resolveSeasonExperience } from '../lib/season-experience';
import { SeasonExperienceProvider } from './season-experience';

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
        <SeasonExperienceProvider experience={resolveSeasonExperience()}><AppShell viewer={viewer}>{children}</AppShell></SeasonExperienceProvider>
      </body>
    </html>
  );
}
