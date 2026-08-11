/**
 * Настройки оптимизации картинок внутри .docx.
 *
 * Порог по стороне: A4 при 200 dpi — это 1654x2339 px. Больше не нужно ни
 * экрану, ни принтеру, а LibreOffice декодирует и пережимает лишние пиксели
 * на КАЖДОЙ конвертации.
 */
export type DocxMediaConfig = {
    /** Максимальная сторона картинки в пикселях. */
    maxDimensionPx: number;
    /** Качество JPEG при перекодировании. */
    jpegQuality: number;
    /** Картинки мельче этого размера не трогаем — там нечего экономить. */
    minBytesToProcess: number;
};

export const DOCX_MEDIA_CONFIG = Symbol('DOCX_MEDIA_CONFIG');

export const DOCX_MEDIA_DEFAULTS: DocxMediaConfig = {
    maxDimensionPx: 2339,
    jpegQuality: 85,
    minBytesToProcess: 64 * 1024,
};

type EnvReader = { get<T>(key: string): T | undefined };

function parseIntOrDefault(
    raw: string | undefined,
    defaultValue: number,
    min: number,
): number {
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed >= min ? parsed : defaultValue;
}

export function buildDocxMediaConfig(env: EnvReader): DocxMediaConfig {
    return {
        maxDimensionPx: parseIntOrDefault(
            env.get<string>('DOCX_MEDIA_MAX_DIMENSION_PX'),
            DOCX_MEDIA_DEFAULTS.maxDimensionPx,
            200,
        ),
        jpegQuality: parseIntOrDefault(
            env.get<string>('DOCX_MEDIA_JPEG_QUALITY'),
            DOCX_MEDIA_DEFAULTS.jpegQuality,
            1,
        ),
        minBytesToProcess: parseIntOrDefault(
            env.get<string>('DOCX_MEDIA_MIN_BYTES'),
            DOCX_MEDIA_DEFAULTS.minBytesToProcess,
            0,
        ),
    };
}
