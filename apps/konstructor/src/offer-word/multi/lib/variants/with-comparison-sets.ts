import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';

/**
 * Режим «для сравнения»: печатается открытый (первый) участник. Если в
 * настройках КП включён показ альтернатив — основные наборы остальных
 * участников уходят в его наборы «для сравнения»: механика альтернативных
 * наборов в шаблоне уже есть, второго пути печати не нужно.
 */
export const withComparisonSets = (
    variants: readonly DocumentVariantDto[],
    showAlternatives: boolean,
): DocumentVariantDto => {
    const [open, ...others] = variants;
    if (!open) {
        throw new Error('withComparisonSets: нет участников');
    }
    if (!showAlternatives || !others.length) {
        return open;
    }
    return {
        ...open,
        sets: {
            general: open.sets.general,
            alternative: [
                ...open.sets.alternative,
                ...others.flatMap(item => item.sets.general),
            ],
        },
    };
};
