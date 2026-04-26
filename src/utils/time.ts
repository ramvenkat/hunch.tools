export function todayStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function timestamp(date = new Date()): string {
  return date.toISOString();
}
