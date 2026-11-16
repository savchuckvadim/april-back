import { Logger } from '@nestjs/common';
import { readFile, stat } from 'fs/promises';
import { extname, join } from 'path';
import type {
    OfferPdfAssets,
    OfferPdfBrand,
    OfferPdfImage,
    OfferPdfLogo,
} from '../model/offer-pdf-document.model';
import { parseSvgLogo } from './svg-logo.util';

/** Картинки стилей внутри storage/app */
export const OFFER_PDF_ASSETS_SUBPATH = join('konstructor', 'offer-pdf');
/** Логотипы внутри storage/app */
const LOGOS_SUBPATH = 'logos';
const LOGO_FILES: Record<OfferPdfBrand, string> = {
    garant: 'garant_logo_pink.svg',
    iscra: 'iscra_logo.svg',
};

/** Каталог storage/app — как у StorageService: STORAGE_PATH или ./storage */
export const defaultStorageAppDir = (): string =>
    join(process.env.STORAGE_PATH || 'storage', 'app');

/** Что подгрузить для стиля */
export interface OfferPdfAssetRequest {
    /** Пути внутри konstructor/offer-pdf: «facet/cover.jpg» */
    images?: readonly string[];
    logos?: readonly OfferPdfBrand[];
}

/** Что подгрузилось и чего не хватило */
export interface OfferPdfAssetLoad {
    assets: OfferPdfAssets;
    /** Файлы стиля, которых нет или которые не прочитались, — пути внутри storage/app */
    missing: string[];
    /**
     * Подпись набора файлов (размер и время правки каждого): меняется, когда
     * файл занесли, заменили или убрали. По ней превью стиля понимает, что
     * собранное раньше устарело.
     */
    version: string;
}

/** Прочитанный файл и подпись, при которой он прочитан */
interface Entry<V> {
    signature: string;
    value: Promise<V | null>;
}

interface Loaded<V> {
    value: V | null;
    signature: string;
}

/** Подпись отсутствующего файла */
const NO_FILE = '-';

const formatOf = (file: string): OfferPdfImage['format'] | null => {
    const ext = extname(file).toLowerCase();
    if (ext === '.png') return 'png';
    if (ext === '.jpg' || ext === '.jpeg') return 'jpg';
    return null;
};

/** Путь файла внутри storage/app — всегда через «/»: он уходит в лог и в ответ */
const fileId = (...parts: string[]): string =>
    parts.join('/').split('\\').join('/');

/** Код ошибки fs. Без instanceof: ошибка может прийти из другого контекста (jest, vm) */
const codeOf = (error: unknown): string => {
    const code =
        typeof error === 'object' && error !== null && 'code' in error
            ? error.code
            : null;
    return typeof code === 'string' ? code : 'UNKNOWN';
};

/**
 * Картинки и логотипы стилей из storage. Файлы владелец заносит на сервер
 * руками, в git их нет. Нет файла — стиль рисуется без него, а вызывающий
 * получает список недостающего.
 *
 * Прочитанное держится в памяти, но перед отдачей сверяется с диском (stat:
 * размер и время правки): заменённый или дозалитый файл перечитывается без
 * перезапуска. О каждой беде с файлом в лог пишется один раз.
 */
export class OfferPdfAssetStore {
    private readonly logger = new Logger(OfferPdfAssetStore.name);
    private readonly images = new Map<string, Entry<OfferPdfImage>>();
    private readonly logos = new Map<string, Entry<OfferPdfLogo>>();
    /** О чём уже написали в лог: файл → код беды */
    private readonly reported = new Map<string, string>();

    constructor(private readonly root: string = defaultStorageAppDir()) {}

    async load(request: OfferPdfAssetRequest): Promise<OfferPdfAssetLoad> {
        const images = request.images ?? [];
        const logos = request.logos ?? [];
        const imageFiles = images.map(name =>
            fileId(OFFER_PDF_ASSETS_SUBPATH, name),
        );
        const logoFiles = logos.map(brand =>
            fileId(LOGOS_SUBPATH, LOGO_FILES[brand]),
        );

        const [loadedImages, loadedLogos] = await Promise.all([
            Promise.all(imageFiles.map(file => this.image(file))),
            Promise.all(logoFiles.map(file => this.logo(file))),
        ]);

        const files = [...imageFiles, ...logoFiles];
        const loaded = [...loadedImages, ...loadedLogos];
        return {
            assets: {
                images: Object.fromEntries(
                    images.flatMap((name, at) => {
                        const image = loadedImages[at]?.value;
                        return image ? [[name, image]] : [];
                    }),
                ),
                logos: Object.fromEntries(
                    logos.flatMap((brand, at) => {
                        const logo = loadedLogos[at]?.value;
                        return logo ? [[brand, logo]] : [];
                    }),
                ),
            },
            missing: files.filter((_file, at) => !loaded[at]?.value),
            version: files
                .map(
                    (file, at) => `${file}@${loaded[at]?.signature ?? NO_FILE}`,
                )
                .join('|'),
        };
    }

    private image(file: string): Promise<Loaded<OfferPdfImage>> {
        const format = formatOf(file);
        if (!format) {
            this.report(file, 'FORMAT', 'warn', 'Картинка стиля КП не png/jpg');
            return Promise.resolve({ value: null, signature: NO_FILE });
        }
        return this.resolve(this.images, file, data => ({ data, format }));
    }

    private logo(file: string): Promise<Loaded<OfferPdfLogo>> {
        return this.resolve(this.logos, file, data => {
            const logo = parseSvgLogo(data.toString('utf8'));
            // неразобранный остаётся в кэше под своей подписью: не разбираем его на каждый рендер
            if (!logo)
                this.report(file, 'PARSE', 'warn', 'Логотип не разобран');
            return logo;
        });
    }

    /** Из памяти — если файл на диске тот же, что читали; иначе читаем заново */
    private async resolve<V>(
        cache: Map<string, Entry<V>>,
        file: string,
        parse: (data: Buffer) => V | null,
    ): Promise<Loaded<V>> {
        const signature = await this.signatureOf(file);
        if (signature === null) {
            cache.delete(file);
            return { value: null, signature: NO_FILE };
        }
        const hit = cache.get(file);
        if (hit?.signature === signature) {
            return { value: await hit.value, signature };
        }
        const entry: Entry<V> = {
            signature,
            value: this.read(file).then(data => {
                // не прочитался — не запоминаем: следующий рендер попробует снова
                if (!data && cache.get(file) === entry) cache.delete(file);
                const value = data ? parse(data) : null;
                // файл в порядке — о новой беде с ним напишем заново
                if (value !== null) this.reported.delete(file);
                return value;
            }),
        };
        cache.set(file, entry);
        return { value: await entry.value, signature };
    }

    /** Размер и времена файла; null — файла нет или он недоступен */
    private async signatureOf(file: string): Promise<string | null> {
        try {
            const info = await stat(join(this.root, file));
            // ctime ловит смену прав без правки содержимого
            return `${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
        } catch (error) {
            this.reportFailure(file, error);
            return null;
        }
    }

    private async read(file: string): Promise<Buffer | null> {
        try {
            return await readFile(join(this.root, file));
        } catch (error) {
            this.reportFailure(file, error);
            return null;
        }
    }

    /** Нет файла — предупреждение; нет прав и прочее — ошибка: это уже не «забыли занести» */
    private reportFailure(file: string, error: unknown): void {
        const code = codeOf(error);
        if (code === 'ENOENT') {
            this.report(
                file,
                code,
                'warn',
                'Нет файла для стиля КП, рисуем без него',
            );
            return;
        }
        this.report(
            file,
            code,
            'error',
            `Файл стиля КП не читается (${code}), рисуем без него`,
        );
    }

    /** Одна запись в лог на файл и вид беды, пока она не сменится */
    private report(
        file: string,
        code: string,
        level: 'warn' | 'error',
        message: string,
    ): void {
        if (this.reported.get(file) === code) return;
        this.reported.set(file, code);
        this.logger[level](`${message}: ${join(this.root, file)}`);
    }
}
