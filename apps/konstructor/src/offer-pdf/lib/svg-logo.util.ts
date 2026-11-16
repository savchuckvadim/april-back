import type {
    OfferPdfLogo,
    OfferPdfLogoPath,
} from '../model/offer-pdf-document.model';

const SIZE = /<svg\b[^>]*?\bwidth="([\d.]+)"[^>]*?\bheight="([\d.]+)"/;
const VIEW_BOX = /<svg\b[^>]*?\bviewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"/;
const GROUP_TRANSFORM = /<g\b[^>]*?\btransform="([^"]+)"/;
const PATH = /<path\b[^>]*?\/?>/g;
const ATTR = (name: string): RegExp => new RegExp(`\\b${name}="([^"]+)"`);

/**
 * Одноцветный логотип из SVG (как файлы в storage/app/logos): размеры,
 * transform первой группы и пути с их transform. Цвет из файла не берётся —
 * заливку задаёт тема. Сложные SVG (градиенты, картинки) не поддержаны:
 * у логотипов Гаранта и Искры их нет.
 */
export const parseSvgLogo = (svg: string): OfferPdfLogo | null => {
    const size = SIZE.exec(svg) ?? VIEW_BOX.exec(svg);
    if (!size) return null;
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
        width: Number(size[1]),
        height: Number(size[2]),
        ...(groupTransform ? { groupTransform } : {}),
        paths,
    };
};
