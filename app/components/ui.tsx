"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export function Panel({ title, eyebrow, action, children, className = "" }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`.trim()}><div className="panel-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{action}</div>{children}</section>;
}

export function EmptyState({ icon = "wallet", title, description, action }: { icon?: IconName; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-state-icon"><Icon name={icon}/></span><div><strong>{title}</strong><p>{description}</p></div>{action}</div>;
}

export function Empty({ text }: { text: string }) {
  return <EmptyState title={text} description="Os dados aparecerão aqui assim que houver um lançamento."/>;
}

export function IconButton({ icon, label, tone = "neutral", ...props }: { icon: IconName; label: string; tone?: "neutral" | "danger" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`icon-button ${tone === "danger" ? "delete-icon" : "edit-icon"}`} aria-label={label} title={label} {...props}><Icon name={icon}/></button>;
}

export function StatusNotice({ message, tone = "success", onClose }: { message: string; tone?: "success" | "error"; onClose: () => void }) {
  return <div className={`notice ${tone}`} role={tone === "error" ? "alert" : "status"}><Icon name={tone === "error" ? "retry" : "check"}/><span>{message}</span><IconButton icon="close" label="Fechar mensagem" onClick={onClose}/></div>;
}

export function LoadingSkeleton() {
  return <div className="skeleton-layout" role="status" aria-label="Carregando seus dados"><div className="skeleton-card large"/><div className="skeleton-card"/><div className="skeleton-card"/><div className="skeleton-panel"/><div className="skeleton-panel"/></div>;
}

export function DialogFrame({ titleId, title, description, onClose, children, className = "", footer }: { titleId: string; title: string; description?: string; onClose: () => void; children: ReactNode; className?: string; footer?: ReactNode }) {
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelector<HTMLElement>("input, select, button, [href], [tabindex]:not([tabindex='-1'])");
    focusable?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>("input, select, button, [href], [tabindex]:not([tabindex='-1'])")].filter(item => !item.hasAttribute("disabled"));
      if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previousFocus.current?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className={`edit-modal ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId}><div className="dialog-heading"><div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div><IconButton icon="close" label="Fechar" onClick={onClose}/></div>{children}{footer && <div className="modal-actions">{footer}</div>}</section></div>;
}
