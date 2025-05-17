import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

export function parseToISO(input: string, offsetDays = 0): string {
  const parsed = dayjs(input, ['YYYY-MM-DD', 'DD.MM.YYYY'], true);

  if (!parsed.isValid()) {
    throw new Error(`Invalid date format: ${input}`);
  }

  const shifted = parsed.add(offsetDays, 'day').toDate();
  return shifted.toISOString().split('T')[0]; // 'YYYY-MM-DD'
}