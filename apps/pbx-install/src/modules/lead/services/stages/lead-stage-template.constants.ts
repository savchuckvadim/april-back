import { PbxEntityGroupEnum } from '@app/pbx-install/shared/entity/field/parse-entity-field.service';
import {
    getPbxLeadStageTemplate,
    PbxLeadStageTemplateItem,
} from '@lib/portal-lib/pbx-domain';

/**
 * Шаблон стадий лида переехал в portal-lib (2026-08-05):
 * `libs/portal-lib/pbx/domain/src/portal-lead/stages/const/pbx-lead-stages.const.ts`
 * — коды нужны рантайму (хук «лид → работа» в event-sales), а импорт
 * app→app запрещён. Этот файл сохранён как совместимая обёртка.
 *
 * Расширение шаблона: item получил bitrixStatusId / semantics /
 * installMode ('create' | 'map-only') / dealStageCode (зеркало стадии ОП).
 * `bitrixId` строки btx_stages по-прежнему появляется только после
 * сопоставления или установки.
 */
export type LeadStageTemplateItem = PbxLeadStageTemplateItem;

/** Шаблон стадий лида для указанной группы (пустой массив, если группа неизвестна). */
export function getLeadStageTemplate(
    group: PbxEntityGroupEnum,
): LeadStageTemplateItem[] {
    return [...getPbxLeadStageTemplate(group)];
}
