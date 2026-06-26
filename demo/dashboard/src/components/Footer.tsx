// Minimal dark footer in the todea.co.kr style (#0a0f10 surface, inverted mark).
export default function Footer() {
  return (
    <footer className="bg-ink text-white mt-24">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-3.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Todea" className="h-6 w-auto invert" width="120" height="24" />
            <span className="w-px h-5 bg-neutral-700" aria-hidden="true" />
            <p className="text-[13px] text-neutral-400">
              Dashboard · service-mesh demo
            </p>
          </div>
          <p className="text-[11px] font-medium tracking-[.22em] uppercase text-neutral-600">
            KCD Kuala Lumpur 2026
          </p>
        </div>
      </div>
    </footer>
  );
}
