import './styles.css';

export function App() {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded-md"
      >
        Skip to main content
      </a>
      <main
        id="main-content"
        className="min-h-screen bg-surface flex items-center justify-center"
      >
        <h1 className="text-text text-2xl font-bold">CoMapeo Cloud</h1>
      </main>
    </>
  );
}
