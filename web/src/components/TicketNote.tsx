import { useEffect, useRef, useState } from "react";
import { StickyNote, Plus, Trash2 } from "lucide-react";
import { useNote } from "@/lib/notes";

export function TicketNote({ ticketKey }: { ticketKey: string }) {
  const [note, setNote] = useNote(ticketKey);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing) {
      setDraft(note);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(note.length, note.length);
      });
    }
  }, [editing, note]);

  function commit() {
    setNote(draft);
    setEditing(false);
  }

  function cancel() {
    setEditing(false);
    setDraft(note);
  }

  const tintedBg = "bg-[color-mix(in_oklch,var(--color-warning)_7%,transparent)]";

  if (editing) {
    return (
      <div className={`${tintedBg} border-b border-[var(--color-border-subtle)]`}>
        <div className="flex items-center gap-1.5 px-3.5 pt-2 text-[10px] uppercase tracking-[0.14em] text-[var(--color-warning)] font-semibold">
          <StickyNote className="w-3 h-3" />
          Quick note
          <span className="ml-auto text-[10px] normal-case tracking-normal text-[var(--color-fg-dim)] font-normal">
            ⌘+Enter or click outside to save · Esc to cancel
          </span>
        </div>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="Write a quick note for yourself…"
          rows={2}
          className="w-full bg-transparent text-sm px-3.5 py-1.5 pb-2.5 resize-y min-h-[44px] focus:outline-none placeholder:text-[var(--color-fg-dim)] text-[var(--color-fg)]"
        />
      </div>
    );
  }

  if (!note) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className="w-full px-3.5 py-1.5 text-left flex items-center gap-1.5 text-[11px] text-[var(--color-fg-dim)] hover:text-[var(--color-warning)] hover:bg-[color-mix(in_oklch,var(--color-warning)_5%,transparent)] border-b border-[var(--color-border-subtle)] transition-colors"
      >
        <Plus className="w-3 h-3" />
        Add quick note
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className={`w-full px-3.5 py-2 text-left ${tintedBg} hover:bg-[color-mix(in_oklch,var(--color-warning)_11%,transparent)] border-b border-[var(--color-border-subtle)] transition-colors group`}
    >
      <div className="flex items-start gap-2">
        <StickyNote className="w-3.5 h-3.5 mt-0.5 text-[var(--color-warning)] shrink-0" />
        <div className="flex-1 text-sm text-[var(--color-fg)] whitespace-pre-wrap italic leading-snug">
          {note}
        </div>
        <span
          role="button"
          tabIndex={0}
          aria-label="Delete note"
          onClick={(e) => {
            e.stopPropagation();
            setNote("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              setNote("");
            }
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--color-fg-dim)] hover:text-[var(--color-danger)] shrink-0 mt-0.5 cursor-pointer"
        >
          <Trash2 className="w-3 h-3" />
        </span>
      </div>
    </button>
  );
}
