import type { PortalModel } from '@lib/portal-lib/portal/services/portal.model';

/** pbx-коды и русские названия воронки/стадии сделки по bitrix-id из CRM. */
export interface DealCodesResolved {
    categoryCode: string;
    categoryTitle: string | null;
    stageCode: string | null;
    stageTitle: string | null;
}

/**
 * Обратный резолв CATEGORY_ID/STAGE_ID сделки в pbx-коды и названия по
 * слепку портала — чистая функция без DI, чтобы паспорт звонка не держал
 * эту логику у себя. Воронка не заведена в pbx — null (чужая воронка:
 * кодов нет, приор типа звонка не строится). В pbx STAGE_ID хранится
 * полностью (C5:PREPARATION); на случай хранения без префикса воронки
 * сверяем и по суффиксу. Fail-open: слепок без воронок — null.
 *
 * Названия нужны промпту вместо кодов: код «C5:EXECUTING» модель
 * переносила в текст разбора как есть (поля смарта с английскими кодами,
 * 09.11.2026).
 */
export function resolveDealCodes(
    portal: PortalModel,
    rawCategoryId: string | null,
    rawStageId: string | null,
): DealCodesResolved | null {
    try {
        const categoryId = rawCategoryId ?? '0';
        const category = portal
            .getDealCategories()
            .find(item => String(item.bitrixId) === categoryId);
        if (!category) return null;
        const suffix = rawStageId?.split(':').pop();
        const stage = rawStageId
            ? category.stages.find(
                  item =>
                      item.bitrixId === rawStageId || item.bitrixId === suffix,
              )
            : undefined;
        return {
            categoryCode: category.code,
            categoryTitle: category.title || category.name || null,
            stageCode: stage?.code ?? null,
            stageTitle: stage?.title || stage?.name || null,
        };
    } catch {
        return null;
    }
}

/**
 * Название статуса лида (STATUS_ID) по слепку портала; статус вне pbx
 * или слепок без лидов — null (промпт без названия статуса).
 */
export function resolveLeadStatusTitle(
    portal: PortalModel,
    statusId: string | null,
): string | null {
    if (!statusId) return null;
    try {
        for (const category of portal.getLeadCategories()) {
            const stage = category.stages.find(
                item => item.bitrixId === statusId,
            );
            if (stage) return stage.title || stage.name || null;
        }
    } catch {
        // слепок без лидов — без названия
    }
    return null;
}
