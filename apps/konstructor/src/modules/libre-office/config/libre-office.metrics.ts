/** Имена метрик — общие для провайдеров модуля и @InjectMetric. */
export const LIBREOFFICE_CONVERSION_DURATION_SECONDS =
    'libreoffice_conversion_duration_seconds';
export const LIBREOFFICE_CONVERSION_ERRORS_TOTAL =
    'libreoffice_conversion_errors_total';
export const LIBREOFFICE_POOL_SLOTS = 'libreoffice_pool_slots';

/**
 * Бакеты под реальную конвертацию DOCX → PDF: простой оффер — единицы
 * секунд, тяжёлый с картинками — десятки, дальше уже таймаут.
 */
export const LIBREOFFICE_DURATION_BUCKETS = [
    1, 2, 5, 10, 20, 30, 60, 120, 240,
] as const;
