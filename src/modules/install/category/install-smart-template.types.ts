import { BitrixService } from '@/modules/bitrix';
import { Category } from '../smart/type/parse.type';

/** Параметры оркестратора установки воронок/стадий смарта из шаблона (Excel → install). */
export interface InstallSmartCategoriesParams {
    bitrix: BitrixService;
    domain: string;
    smartType: string;
    smartGroup: string;
    entityTypeId: number;
    templateCategories: Category[];
}

/** После синка воронки в Bitrix + `btx_categories` — эти id нужны для `crm.status.*` и `btx_stages`. */
export interface EnsuredSmartCategoryRow {
    cat: Category;
    bxCategoryId: number;
    portalCategoryId: number;
    /** Воронка только что создана (`crm.category.add`) — в Bitrix уже есть дефолтные стадии; их нужно снести перед заливкой шаблона. */
    isNewCategory: boolean;
}
