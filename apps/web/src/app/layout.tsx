import './global.css';

export const metadata = {
  title: 'Fantasy Basketball Draft Room',
  description: 'League-specific rankings, auction values, and draft analysis.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
