import { useEffect, useState } from "react";
import { X, ExternalLink } from "lucide-react";

export function Lightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    if (!src) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center cursor-zoom-out"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur flex items-center justify-center text-white transition-colors z-10"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-3 h-10 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur text-white text-xs font-medium transition-colors z-10"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        Open original
      </a>
      <img
        src={src}
        alt=""
        onLoad={() => setLoaded(true)}
        onClick={(e) => e.stopPropagation()}
        style={{ opacity: loaded ? 1 : 0 }}
        className="max-w-[95vw] max-h-[95vh] object-contain rounded-lg shadow-2xl transition-opacity duration-200 cursor-default"
      />
    </div>
  );
}
