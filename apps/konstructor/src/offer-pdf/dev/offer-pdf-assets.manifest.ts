/**
 * Что подготовить для стилей КП и откуда. Источники — материалы владельца в
 * storage/app/konstructor/for_new_templates (в git их нет): листы из Canva
 * (`<набор>/<файл>.png`) и картинки вордовских шаблонов (`word/<файл>.docx`).
 */
export interface OfferPdfAssetSource {
    /** Лист Canva: путь внутри for_new_templates */
    file?: string;
    /** Картинка из docx: путь к docx внутри for_new_templates и запись в архиве */
    docx?: { path: string; entry: string };
}

export interface OfferPdfAssetJob {
    /** Куда: путь внутри storage/app/konstructor/offer-pdf */
    target: string;
    source: OfferPdfAssetSource;
    /** Ширина в пикселях после уменьшения */
    width: number;
    /** Обрезка, доли исходника: сверху/снизу, слева/справа (по умолчанию вся ширина) */
    crop?: {
        top: number;
        bottom: number;
        left?: number;
        right?: number;
    };
    /**
     * jpg — листы без прозрачности; png — вырезки с прозрачностью;
     * palette — PNG в 256 цветов (3D-объекты; мягкие градиенты — без неё)
     */
    format: 'jpg' | 'png';
    palette?: boolean;
    /** Закрасить в исходнике (пиксели исходника): номер страницы Canva и т. п. */
    erase?: {
        left: number;
        top: number;
        width: number;
        height: number;
        color: string;
    };
}

const MODERNE_DOCX = 'word/moderne.docx';
const ISKRA_DOCX = 'word/iskra.docx';

export const OFFER_PDF_ASSET_JOBS: readonly OfferPdfAssetJob[] = [
    // «Перламутр» — набор 1: обложка и лист с полосой-шапкой
    {
        target: 'pearl/cover.jpg',
        source: { file: '1/Дизайн без названия (29).png' },
        width: 1414,
        format: 'jpg',
        // номер страницы из Canva в правом нижнем углу
        erase: {
            left: 1300,
            top: 1900,
            width: 32,
            height: 42,
            color: '#FAFAFA',
        },
    },
    {
        target: 'pearl/sheet.jpg',
        source: { file: '1/Дизайн без названия (31).png' },
        width: 1414,
        format: 'jpg',
    },
    // «Ореол» — набор 10: обложка; на листах только коралловая черта — вектором
    {
        target: 'halo/cover.jpg',
        source: { file: '10/Дизайн без названия (12).png' },
        width: 1414,
        format: 'jpg',
    },
    // «Шёлк» — набор 13: обложка; на листах — она же бледно под карточками
    {
        target: 'silk/cover.jpg',
        source: { file: '13/Дизайн без названия (8).png' },
        width: 1414,
        format: 'jpg',
    },
    // «Модерн» — картинки вордовского шаблона; прозрачный только белый угол — JPEG на белом
    {
        target: 'moderne/cover.jpg',
        source: {
            docx: { path: MODERNE_DOCX, entry: 'word/media/image9.png' },
        },
        width: 1240,
        format: 'jpg',
    },
    {
        target: 'moderne/corner-top.jpg',
        source: {
            docx: { path: MODERNE_DOCX, entry: 'word/media/image5.png' },
        },
        width: 700,
        format: 'jpg',
    },
    {
        target: 'moderne/corner-bottom.jpg',
        source: {
            docx: { path: MODERNE_DOCX, entry: 'word/media/image6.png' },
        },
        width: 700,
        format: 'jpg',
    },
    // «Искра» — картинки вордовского шаблона; лежат на белом листе — JPEG на белом, без прозрачности
    {
        target: 'iskra/knot.jpg',
        source: { docx: { path: ISKRA_DOCX, entry: 'word/media/image2.png' } },
        width: 900,
        format: 'jpg',
    },
    {
        target: 'iskra/flame.jpg',
        source: { docx: { path: ISKRA_DOCX, entry: 'word/media/image11.png' } },
        width: 260,
        format: 'jpg',
    },
    {
        target: 'iskra/rocket.jpg',
        source: { docx: { path: ISKRA_DOCX, entry: 'word/media/image13.png' } },
        width: 360,
        format: 'jpg',
    },
    {
        target: 'iskra/trophy.jpg',
        source: { docx: { path: ISKRA_DOCX, entry: 'word/media/image14.png' } },
        width: 360,
        format: 'jpg',
    },
    {
        target: 'iskra/coins.jpg',
        source: { docx: { path: ISKRA_DOCX, entry: 'word/media/image19.png' } },
        width: 420,
        format: 'jpg',
    },
];
