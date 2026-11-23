import sharp from 'sharp';
import type {
    OfferPdfImage,
    OfferPdfImages,
} from '../model/offer-pdf-document.model';

/**
 * Картинки поставщика для сценария аудита: печать, подпись и логотип рисуются
 * здесь же через sharp, файлов картинок в git нет. Размеры в три раза больше
 * места в блоке подписи (печать 92×92, подпись 80×40), как у настоящих сканов.
 */

const STAMP_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="276" height="276" viewBox="0 0 276 276">
  <circle cx="138" cy="138" r="130" fill="none" stroke="#1d4ed8" stroke-width="8"/>
  <circle cx="138" cy="138" r="104" fill="none" stroke="#1d4ed8" stroke-width="3"/>
  <path d="M138 70 L152 112 L196 112 L160 138 L174 180 L138 154 L102 180 L116 138 L80 112 L124 112 Z" fill="#1d4ed8"/>
</svg>`;

const SIGNATURE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120">
  <path d="M10 90 C40 10 60 10 70 70 S100 110 120 50 S160 20 170 80 S200 100 230 40" fill="none" stroke="#111827" stroke-width="5" stroke-linecap="round"/>
</svg>`;

const LOGO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="100" viewBox="0 0 320 100">
  <rect x="0" y="0" width="320" height="100" rx="16" fill="#e11d48"/>
  <rect x="16" y="16" width="288" height="68" rx="8" fill="#ffffff"/>
  <rect x="32" y="32" width="120" height="36" rx="6" fill="#e11d48"/>
</svg>`;

/** Печать и подпись — PNG с прозрачным фоном, как сканы на белом листе. */
const png = async (svg: string): Promise<OfferPdfImage> => ({
    data: await sharp(Buffer.from(svg)).png().toBuffer(),
    format: 'png',
});

/** Логотип — JPEG: так проверяется и второй формат, который принимает админка. */
const jpg = async (svg: string): Promise<OfferPdfImage> => ({
    data: await sharp(Buffer.from(svg))
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 80 })
        .toBuffer(),
    format: 'jpg',
});

/** Печать, подпись руководителя и логотип — все три картинки КП. */
export const createAuditProviderImages = async (): Promise<OfferPdfImages> => {
    const [stamp, signature, logo] = await Promise.all([
        png(STAMP_SVG),
        png(SIGNATURE_SVG),
        jpg(LOGO_SVG),
    ]);
    return { stamp, signature, logo };
};
