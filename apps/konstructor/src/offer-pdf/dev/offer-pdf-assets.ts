/**
 * Подготовка картинок стилей КП из материалов владельца:
 *
 *   npm run offer-pdf:assets
 *
 * Читает storage/app/konstructor/for_new_templates (листы Canva и docx
 * вордовских шаблонов), уменьшает, обрезает и сжимает по манифесту и пишет
 * в storage/app/konstructor/offer-pdf/<стиль>/. Папку offer-pdf владелец
 * заносит на сервер руками — в git картинок нет.
 */
import AdmZip from 'adm-zip';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import sharp from 'sharp';
import {
    defaultStorageAppDir,
    OFFER_PDF_ASSETS_SUBPATH,
} from '../lib/offer-pdf-asset-store';
import {
    OFFER_PDF_ASSET_JOBS,
    type OfferPdfAssetJob,
    type OfferPdfAssetSource,
} from './offer-pdf-assets.manifest';

const storageApp = defaultStorageAppDir();
const SOURCES = join(storageApp, 'konstructor', 'for_new_templates');
const TARGETS = join(storageApp, OFFER_PDF_ASSETS_SUBPATH);

const readSource = (source: OfferPdfAssetSource): Buffer => {
    if (source.file) return readFileSync(join(SOURCES, source.file));
    if (source.docx) {
        const entry = new AdmZip(join(SOURCES, source.docx.path)).getEntry(
            source.docx.entry,
        );
        if (!entry) {
            throw new Error(`В ${source.docx.path} нет ${source.docx.entry}`);
        }
        return entry.getData();
    }
    throw new Error('У задания нет источника');
};

const prepare = async (job: OfferPdfAssetJob): Promise<Buffer> => {
    let image = sharp(readSource(job.source));
    if (job.erase) {
        const { left, top, width, height, color } = job.erase;
        const patch = await sharp({
            create: { width, height, channels: 3, background: color },
        })
            .png()
            .toBuffer();
        image = sharp(
            await image.composite([{ input: patch, left, top }]).toBuffer(),
        );
    }
    if (job.crop) {
        const meta = await image.metadata();
        const height = meta.height ?? 0;
        const top = Math.round(height * job.crop[0]);
        image = sharp(
            await image
                .extract({
                    left: 0,
                    top,
                    width: meta.width ?? 0,
                    height: Math.round(height * job.crop[1]) - top,
                })
                .toBuffer(),
        );
    }
    image = image.resize({ width: job.width, withoutEnlargement: true });
    return job.format === 'jpg'
        ? image
              .flatten({ background: '#ffffff' })
              .jpeg({ quality: 82, mozjpeg: true })
              .toBuffer()
        : image
              .png({
                  compressionLevel: 9,
                  ...(job.palette ? { palette: true, quality: 90 } : {}),
              })
              .toBuffer();
};

const main = async (): Promise<void> => {
    let total = 0;
    for (const job of OFFER_PDF_ASSET_JOBS) {
        const data = await prepare(job);
        const file = join(TARGETS, job.target);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, data);
        total += data.length;
        console.log(`${job.target}: ${Math.round(data.length / 1024)} КБ`);
    }
    console.log(
        `\nГотово: ${OFFER_PDF_ASSET_JOBS.length} файлов, ${Math.round(total / 1024)} КБ → ${TARGETS}`,
    );
};

main().catch(error => {
    console.error(error);
    process.exit(1);
});
