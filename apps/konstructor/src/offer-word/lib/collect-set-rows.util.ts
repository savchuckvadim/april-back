import { ProductRowDto } from '@app/konstructor/document-generate/dto/product-row/product-row.dto';
import { ProductRowSetItemDto } from '@app/konstructor/document-generate/dto/product-row-set/product-row-set.dto';

/**
 * Все строки сета подряд — по типам продукта в том порядке, в каком их
 * прислал фронт (Гарант, LT, прочие LT, консалтинг, СТАР, Академия).
 *
 * Любой тип может отсутствовать, быть пустым массивом или null — такие
 * пропускаются. Порядок типов не фиксируем: счёт печатает строки так, как
 * их собрал конструктор.
 */
export const collectSetRows = (
    setItemRow: ProductRowSetItemDto | null | undefined,
): ProductRowDto[] =>
    Object.values(setItemRow ?? {}).flatMap((rows: unknown) =>
        Array.isArray(rows) ? (rows as ProductRowDto[]) : [],
    );
