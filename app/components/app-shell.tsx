import { BrandMark } from "./brand-mark";
import { Icon, type IconName } from "./icons";
import type { Household } from "../lib/finance-ui";

export type NavigationItem = { id: string; icon: IconName; label: string };

export function AppSidebar({ items, tab, onNavigate, isAdmin, households, selectedHousehold, householdName, onHouseholdChange }: { items: NavigationItem[]; tab: string; onNavigate: (id: string) => void; isAdmin: boolean; households: Household[]; selectedHousehold: string; householdName: string; onHouseholdChange: (id: string) => void }) {
  return <aside className="app-sidebar"><div className="brand"><span><BrandMark/></span><div><strong>Finanças</strong><small>da família</small></div></div><nav aria-label="Navegação principal">{items.map(item => <button key={item.id} className={tab === item.id ? "active" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => onNavigate(item.id)}><i><Icon name={item.icon}/></i><span>{item.label}</span></button>)}</nav><div className="side-note"><span className="side-note-label">{isAdmin ? "Administrador" : "Carteira atual"}</span>{isAdmin && households.length ? <select aria-label="Selecionar carteira" value={selectedHousehold} onChange={event => onHouseholdChange(event.target.value)}>{households.map(household => <option key={household.id} value={household.id}>{household.name}</option>)}</select> : <strong>{householdName}</strong>}{isAdmin && <button className={tab === "admin" ? "admin-link active" : "admin-link"} onClick={() => onNavigate("admin")}><Icon name="settings"/><span>Painel administrativo</span></button>}</div></aside>;
}

export function MobileNavigation({ items, tab, onNavigate }: { items: NavigationItem[]; tab: string; onNavigate: (id: string) => void }) {
  return <nav className="mobile-bottom-nav" aria-label="Navegação principal">{items.map(item => <button key={item.id} type="button" className={`${tab === item.id ? "active" : ""} ${item.id === "novo" ? "main-action" : ""}`} aria-current={tab === item.id ? "page" : undefined} onClick={() => onNavigate(item.id)}><Icon name={item.icon}/><span>{item.label}</span></button>)}</nav>;
}

export function PageHeader({ eyebrow, title, monthLabel, onOpenMonth }: { eyebrow: string; title: string; monthLabel: string; onOpenMonth: () => void }) {
  return <header className="app-header"><div><p>{eyebrow}</p><h1>{title}</h1></div><button className="month-trigger" type="button" onClick={onOpenMonth} aria-haspopup="dialog"><Icon name="calendar"/><span><small>Período</small><b>{monthLabel}</b></span></button></header>;
}
