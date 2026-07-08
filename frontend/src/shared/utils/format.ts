import dayjs from 'dayjs';

export function formatTimestamp(ts: string): string {
  return dayjs(ts).format('HH:mm:ss.SSS');
}
