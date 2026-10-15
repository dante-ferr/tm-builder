import Link from 'next/link';
export default function NotFound() {
  return <main className="route-message"><p className="eyebrow">404 · NO TRANSITION FOUND</p><h1>This page is outside the machine.</h1><Link href="/">Return to workspace →</Link></main>;
}
