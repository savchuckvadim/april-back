import type {
    OfferPdfLogo,
    OfferPdfLogoPath,
} from '../model/offer-pdf-document.model';

const SVG_TAG = /<svg\b[^>]*>/;
const GROUP_TRANSFORM = /<g\b[^>]*?\btransform="([^"]+)"/;
const PATH = /<path\b[^>]*?\/?>/g;
/** Атрибут целиком по имени: `width` не должен совпасть со `stroke-width` */
const ATTR = (name: string): RegExp =>
    new RegExp(`(?<![\\w-])${name}="([^"]+)"`);

const numbers = (value: string | undefined): number[] =>
    (value ?? '')
        .trim()
        .split(/[\s,]+/)
        .map(Number)
        .filter(Number.isFinite);

interface LogoBox {
    minX: number;
    minY: number;
    width: number;
    height: number;
}

/**
 * Область рисования логотипа. viewBox важнее width/height: в экспорте из
 * Figma или Illustrator они расходятся, и по width/height логотип вышел бы
 * в неверном масштабе. Нет viewBox — берём width/height от нуля.
 */
const logoBox = (svgTag: string): LogoBox | null => {
    const viewBox = numbers(ATTR('viewBox').exec(svgTag)?.[1]);
    if (viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
        return {
            minX: viewBox[0],
            minY: viewBox[1],
            width: viewBox[2],
            height: viewBox[3],
        };
    }
    const width = parseFloat(ATTR('width').exec(svgTag)?.[1] ?? '');
    const height = parseFloat(ATTR('height').exec(svgTag)?.[1] ?? '');
    return width > 0 && height > 0 ? { minX: 0, minY: 0, width, height } : null;
};

/**
 * Одноцветный логотип из SVG (как файлы в storage/app/logos): область
 * рисования, transform первой группы и пути с их transform. Цвет из файла не
 * берётся — заливку задаёт тема. Сложные SVG (градиенты, картинки, обводки)
 * не поддержаны: у логотипов Гаранта и Искры их нет.
 */
export const parseSvgLogo = (svg: string): OfferPdfLogo | null => {
    const box = logoBox(SVG_TAG.exec(svg)?.[0] ?? '');
    if (!box) return null;
    const tags: string[] = svg.match(PATH) ?? [];
    const paths = tags.flatMap(tag => {
        const d = ATTR('d').exec(tag)?.[1];
        if (!d) return [];
        const transform = ATTR('transform').exec(tag)?.[1];
        const path: OfferPdfLogoPath = transform ? { d, transform } : { d };
        return [path];
    });
    if (!paths.length) return null;
    const groupTransform = GROUP_TRANSFORM.exec(svg)?.[1];
    return {
        width: box.width,
        height: box.height,
        // сдвиг области пишем, только когда он есть: у файлов без viewBox модель прежняя
        ...(box.minX || box.minY ? { minX: box.minX, minY: box.minY } : {}),
        ...(groupTransform ? { groupTransform } : {}),
        paths,
    };
};
