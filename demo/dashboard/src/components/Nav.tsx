// Fixed top bar — mirrors the todea.co.kr nav (frosted white, 60px, wordmark
// left). The right side carries the demo identity instead of site links.
export default function Nav() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-white/90 border-b border-neutral-100 backdrop-blur-xl">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="flex items-center justify-between h-[60px]">
          <div className="flex items-center gap-3.5">
            <a
              href="https://todea.co.kr"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="Todea" className="h-[26px] w-auto" width="130" height="26" />
            </a>
            <span className="hidden sm:block w-px h-5 bg-neutral-200" aria-hidden="true" />
            <span className="hidden sm:block text-[12px] font-semibold tracking-[.18em] uppercase text-neutral-500">
              Dashboard
            </span>
          </div>

          <div className="flex items-center gap-5">
            <span className="hidden md:inline text-[12px] text-neutral-500 font-mono">
              HTTP + gRPC
            </span>
            <a
              href="https://todea.co.kr"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] font-semibold text-black border border-neutral-300 px-4 py-1.5 rounded-full hover:border-black transition-colors"
            >
              todea.co.kr
            </a>
          </div>
        </div>
      </div>
    </nav>
  );
}
