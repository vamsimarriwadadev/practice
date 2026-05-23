import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Photo BG Remover - Upload & Manage Images',
  description: 'Manage and upload your photos for background removal. Seamless local storage and S3/Floci cloud uploads.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* DM Serif Display + DM Sans — loaded here, never inside component <style> tags */}
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}