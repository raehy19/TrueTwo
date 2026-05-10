// KST (Asia/Seoul) helpers — keep these client-safe.

export function kstDateLabel(dateLike: string | Date): string {
  const d = typeof dateLike === "string" ? new Date(dateLike) : dateLike;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

export function kstTimeLabel(dateLike: string | Date): string {
  const d = typeof dateLike === "string" ? new Date(dateLike) : dateLike;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function timeUntil(target: string | Date): {
  label: string;
  expired: boolean;
  hours: number;
  minutes: number;
} {
  const t = typeof target === "string" ? new Date(target) : target;
  const ms = t.getTime() - Date.now();
  if (ms <= 0)
    return { label: "마감", expired: true, hours: 0, minutes: 0 };
  const total = Math.floor(ms / 60000);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours >= 1) return { label: `${hours}시간 ${minutes}분 남음`, expired: false, hours, minutes };
  return { label: `${minutes}분 남음`, expired: false, hours, minutes };
}
