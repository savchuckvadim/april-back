import {
    TemplateAmbiguityReport,
    TemplateCriteria,
} from '../document-template.criteria';
import { ResolvedTemplate } from '../document-template.service';
import {
    ResolvedTemplateCriteriaDto,
    ResolvedTemplateResponseDto,
    TemplateDiagnosticsResponseDto,
} from '../dto/resolve-template-response.dto';

/**
 * Домен → ответ эндпоинта.
 *
 * Единственное место, где BigInt превращается в строку. Это не косметика:
 * BigInt не сериализуется в JSON — глобальный интерцептор ответа кинет
 * `TypeError: Do not know how to serialize a BigInt`, то есть «забыл
 * String()» означает 500, а не кривое поле. Поэтому маппинг собран в одну
 * функцию и покрыт тестом, а не размазан по контроллеру.
 */
const idToString = (value: bigint | null): string | null =>
    value === null ? null : String(value);

function toCriteriaDto(
    criteria: TemplateCriteria,
): ResolvedTemplateCriteriaDto {
    return {
        portalId: idToString(criteria.portalId),
        agentId: idToString(criteria.agentId),
        contractType: criteria.contractType ?? null,
        clientType: criteria.clientType ?? null,
        supplyType: criteria.supplyType ?? null,
    };
}

/**
 * Причина при откате на storage.
 *
 * `match === null` бывает только у договора и отчёта (у счёта откат
 * запрещён — сервис кидает исключение). Текст объясняет не «ошибку», а
 * нормальный сегодняшний режим: строки справочника нет, документ
 * соберётся из файла.
 */
const FALLBACK_REASON =
    'Подходящей строки справочника нет — документ будет собран из файла шаблона в storage';

export function toResolvedTemplateDto(
    resolved: ResolvedTemplate,
): ResolvedTemplateResponseDto {
    return {
        source: resolved.source,
        templateId: resolved.match?.candidate.id ?? null,
        reason: resolved.match?.reason ?? FALLBACK_REASON,
        criteria: toCriteriaDto(resolved.criteria),
    };
}

/**
 * Отчёт диагностики → ответ. Ящики уже пришли с id-строками из
 * `findAmbiguousBuckets`, поэтому здесь остаётся только перенос.
 */
export function toDiagnosticsDto(
    report: TemplateAmbiguityReport,
): TemplateDiagnosticsResponseDto {
    return {
        portalId: report.portalId,
        ambiguous: report.ambiguous,
        reliesOnCommon: report.reliesOnCommon,
    };
}
