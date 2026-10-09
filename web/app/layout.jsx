import './globals.css';

export const metadata = {
  title: 'tm-builder · Machine workspace',
  description: 'Explore Turing machines, inspect transitions, and replay your tapes.',
};

export default function RootLayout({children}) {
  return <html lang="en"><body>{children}</body></html>;
}
