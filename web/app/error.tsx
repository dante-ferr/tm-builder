'use client';
export default function ErrorPage({reset}: {error: Error & {digest?: string}; reset: () => void}) {
  return <main className="route-message"><h1>The workspace could not load.</h1><p>Please try opening it again.</p><button className="primary" onClick={reset}>Try again</button></main>;
}
