import { recodeLatin1Name } from '../../lib/provider-image-file.util';

/** Корень путей легаси: `files.path` начинается с `clients/`. */
const CLIENTS_ROOT = /(^|\/)clients\//;

/** Обратные слэши в прямые, повторные слэши в один, лишние пробелы по краям убраны. */
const normalizeSlashes = (value: string): string =>
    value
        .trim()
        .replace(/\\/g, '/')
        .replace(/\/{2,}/g, '/');

/**
 * Путь файла из запроса в виде `files.path`. Браузер присылает в имени
 * относительный путь выбранной папки: если перед `clients/` есть ещё что-то
 * (папка выше `clients`), оно отрезается. Слэши нормализуются, кириллица в
 * имени (multer отдаёт его в latin1) восстанавливается.
 */
export const normalizeUploadPath = (name: string): string => {
    const path = normalizeSlashes(recodeLatin1Name(name));
    const match = CLIENTS_ROOT.exec(path);
    return match
        ? path.slice(match.index + match[1].length)
        : path.replace(/^(\.?\/)+/, '');
};

/** Путь из `files.path` в виде, пригодном для сравнения с загруженным. */
export const normalizeLegacyPath = (path: string): string =>
    normalizeSlashes(path).replace(/^\/+/, '');
