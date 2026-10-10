import './globals.css';

export const metadata = {
  title: 'TMBuilder · Turing machine debugger',
  description: 'Explore Turing machines, inspect transitions, and replay your tapes.',
  icons: {icon: '/icon.svg'},
};

export default function RootLayout({children}) {
  return <html lang="en"><body>{children}</body></html>;
}
