import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

function useEsc(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
}

export function Drawer({ open, onClose, children, className }: { open: boolean; onClose: () => void; children: ReactNode; className?: string }) {
  useEsc(open, onClose);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.aside
            role="dialog" aria-modal="true"
            className={cn("glass absolute right-0 top-0 flex h-full w-full max-w-xl flex-col rounded-none border-y-0 border-r-0", className)}
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
          >
            {children}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Modal({ open, onClose, title, children, footer, className }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; className?: string;
}) {
  useEsc(open, onClose);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <motion.div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            className={cn("glass relative w-full max-w-lg rounded-2xl bg-surface/90", className)}
            initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18 }}
          >
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
              <h2 className="text-sm font-semibold">{title}</h2>
              <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-border/60 px-5 py-3.5">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
