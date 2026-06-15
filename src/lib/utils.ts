import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initialsOf(name?: string | null): string {
  if (!name) return '··';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '··';
}

export function nextHalfHour(d = new Date()): Date {
  const out = new Date(d);
  const mins = out.getMinutes();
  if (mins < 30) {
    out.setMinutes(30, 0, 0);
  } else {
    out.setHours(out.getHours() + 1, 0, 0, 0);
  }
  return out;
}

export function formatTimeRange(startISO: string, endISO: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${fmt(startISO)} — ${fmt(endISO)}`;
}
