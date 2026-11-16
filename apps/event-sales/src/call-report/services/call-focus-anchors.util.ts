/**
 * Якоря шкалы из методики портала в промптах оценки (этап 6.6). Методика
 * может описать словами, чему соответствует каждая полоса оценки раздела
 * («1–2 — показа не было … 9–10 — каждый блок по спирали»). Раньше поле
 * `sectionAnchors` хранилось в конфиге, но разбор его не читал.
 *
 * Якоря идут только в проходы, которые ставят оценки (три фокус-прохода и
 * итог), и только когда у методики есть проход для этого типа звонка: тогда
 * в версиях разбора стоит метка методики, и смену якорей видно по её версии.
 *
 * Чистая функция: без DI и чтения базы.
 */
import {
    ANCHOR_BANDS,
    type ResolvedMethodology,
} from '@lib/call-lib/call-report/methodology';
import { CALL_REPORT_SECTIONS } from '@lib/portal-lib/pbx/pbx-aicall-smart';

/**
 * Приоры актуальности разделов для типа звонка из методики портала
 * (`relevance`): какие разделы на этом этапе важны, а какие почти не
 * применимы. Раньше поле хранилось в конфиге, но разбор брал приоры только
 * из профиля типа звонка. У методики приоров для типа нет — undefined:
 * действует профиль типа.
 */
export function methodologyRelevanceFor(
    resolved: ResolvedMethodology | null,
    callType: string | null,
): Readonly<Record<string, number>> | undefined {
    if (!resolved || callType === null) return undefined;
    const relevance: Readonly<
        Record<string, Readonly<Record<string, number>> | undefined>
    > = resolved.methodology.relevance ?? {};
    const forType = relevance[callType];
    return forType && Object.keys(forType).length > 0 ? forType : undefined;
}

/**
 * Блок якорей для промпта; у методики якорей нет — пустая строка.
 * Разделы идут в порядке ядра, полосы — от низкой к высокой.
 */
export function renderMethodologyAnchorsBlock(
    resolved: ResolvedMethodology | null,
): string {
    const anchors = resolved?.methodology.sectionAnchors;
    if (!resolved || !anchors) return '';
    const sections = CALL_REPORT_SECTIONS.map(section => {
        const bands = anchors[section.code];
        if (!bands) return '';
        const lines = ANCHOR_BANDS.filter(band => bands[band]).map(
            band => `  ${band} — ${bands[band]}`,
        );
        return lines.length > 0 ? `${section.title}:\n${lines.join('\n')}` : '';
    }).filter(Boolean);
    if (sections.length === 0) return '';
    return `

ЯКОРЯ ШКАЛЫ ПО МЕТОДИКЕ «${resolved.methodology.title}» — выставляя оценку
разделу, выбирай полосу, описание которой точнее всего подходит этому
разговору, и ставь оценку внутри неё:
${sections.join('\n')}`;
}
