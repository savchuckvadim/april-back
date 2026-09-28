/**
 * Ссылки риск-звонков обзора на карточки разборов в смарте «AI-анализ
 * звонков»: id всех риск-звонков строк одним списком (для одного вызова
 * SmartLinkLoader.resolveLinks на весь обзор) и подстановка карты
 * «transcriptionId → URL» в `managers[].riskCalls[].link`. Тот же приём,
 * что у сигналов пульса (withPulseAlertLinks) и карточек «Внимания»
 * (withAttentionCallLinks). Чистые функции; вынесены из
 * overview.presenter ради лимита «≤ 300 строк».
 */
import { AiManagerRowDto } from '../../dto/ai-manager-row.dto';
import { AiOverviewDto } from '../../dto/ai-overview.dto';

/** Уникальные id транскрипций риск-звонков всех строк в порядке строк. */
export function overviewRiskCallIds(
    managers: readonly AiManagerRowDto[],
): string[] {
    return [
        ...new Set(
            managers.flatMap(row =>
                row.riskCalls.map(call => call.transcriptionId),
            ),
        ),
    ];
}

/**
 * Обзор с проставленными ссылками риск-звонков: id есть в карте → URL
 * элемента смарта (null — элемента по звонку нет), нет в карте → null.
 * Строки без риск-звонков и остальные поля обзора не меняются.
 */
export function withOverviewRiskCallLinks(
    dto: AiOverviewDto,
    links: ReadonlyMap<string, string | null>,
): AiOverviewDto {
    return {
        ...dto,
        managers: dto.managers.map(row =>
            row.riskCalls.length
                ? {
                      ...row,
                      riskCalls: row.riskCalls.map(call => ({
                          ...call,
                          link: links.get(call.transcriptionId) ?? null,
                      })),
                  }
                : row,
        ),
    };
}
