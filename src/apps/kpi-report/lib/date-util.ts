import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

export function parseToISO(input: string): string {
  // пробуем ISO формат
  let parsed = dayjs(input, ['YYYY-MM-DD', 'DD.MM.YYYY'], true);

  if (!parsed.isValid()) {
    throw new Error(`Invalid date format: ${input}`);
  }

  return parsed.format('YYYY-MM-DD'); // ISO формат
}
