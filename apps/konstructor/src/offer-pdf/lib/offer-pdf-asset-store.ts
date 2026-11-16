import { Logger } from '@nestjs/common';
import { readFile } from 'fs/promises';
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

const formatOf = (file: string): OfferPdfImage['format'] | null => {
    const ext = extname(file).toLowerCase();
    if (ext === '.png') return 'png';
    if (ext === '.jpg' || ext === '.jpeg') return 'jpg';
    return null;
};

/**
 * Картинки и логотипы стилей из storage. Файлы владелец заносит на сервер
 * руками, в git их нет. Нет файла — стиль рисуется без него, в лог одно
 * предупреждение на файл. Прочитанное держится в памяти до перезапуска:
 * файлы меняются редко, а КП собираются часто.
 */
export class OfferPdfAssetStore {
    private readonly logger = new Logger(OfferPdfAssetStore.name);
    private readonly images = new Map<string, Promise<OfferPdfImage | null>>();
    private readonly logos = new Map<
        OfferPdfBrand,
        Promise<OfferPdfLogo | null>
    >();
    /** О каком отсутствующем файле уже предупредили */
    private readonly missing = new Set<string>();

    constructor(private readonly root: string = defaultStorageAppDir()) {}

    async load(request: OfferPdfAssetRequest): Promise<OfferPdfAssets> {
        const images = request.images ?? [];
        const logos = request.logos ?? [];
        const [loadedImages, loadedLogos] = await Promise.all([
            Promise.all(images.map(name => this.image(name))),
            Promise.all(logos.map(brand => this.logo(brand))),
        ]);
        return {
            images: Object.fromEntries(
                images.flatMap((name, at) => {
                    const image = loadedImages[at];
                    return image ? [[name, image]] : [];
                }),
            ),
            logos: Object.fromEntries(
                logos.flatMap((brand, at) => {
                    const logo = loadedLogos[at];
                    return logo ? [[brand, logo]] : [];
                }),
            ),
        };
    }

    private image(name: string): Promise<OfferPdfImage | null> {
        return this.cached(this.images, name, () => this.readImage(name));
    }

    private logo(brand: OfferPdfBrand): Promise<OfferPdfLogo | null> {
        return this.cached(this.logos, brand, () => this.readLogo(brand));
    }

    /** Найденное — в кэш; ненайденное не запоминается: файл могут занести позже */
    private cached<K, V>(
        cache: Map<K, Promise<V | null>>,
        key: K,
        read: () => Promise<V | null>,
    ): Promise<V | null> {
        const hit = cache.get(key);
        if (hit) return hit;
        const pending = read().then(value => {
            if (value === null) cache.delete(key);
            return value;
        });
        cache.set(key, pending);
        return pending;
    }

    private async readImage(name: string): Promise<OfferPdfImage | null> {
        const format = formatOf(name);
        const file = join(this.root, OFFER_PDF_ASSETS_SUBPATH, name);
        if (!format) {
            this.logger.warn(`Картинка стиля КП не png/jpg: ${file}`);
            return null;
        }
        const data = await this.read(file);
        return data ? { data, format } : null;
    }

    private async readLogo(brand: OfferPdfBrand): Promise<OfferPdfLogo | null> {
        const file = join(this.root, LOGOS_SUBPATH, LOGO_FILES[brand]);
        const data = await this.read(file);
        if (!data) return null;
        const logo = parseSvgLogo(data.toString('utf8'));
        if (!logo) this.logger.warn(`Логотип не разобран: ${file}`);
        return logo;
    }

    private async read(file: string): Promise<Buffer | null> {
        try {
            return await readFile(file);
        } catch {
            if (!this.missing.has(file)) {
                this.missing.add(file);
                this.logger.warn(
                    `Нет файла для стиля КП, рисуем без него: ${file}`,
                );
            }
            return null;
        }
    }
}
