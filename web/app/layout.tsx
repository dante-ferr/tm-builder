import type {Metadata} from 'next';
import type {ReactNode} from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'TMBuilder · Turing machine debugger',
  description: 'Explore Turing machines, inspect transitions, and replay your tapes.',
  icons: {icon: '/icon.svg'},
};

export default function RootLayout({children}: {children: ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
