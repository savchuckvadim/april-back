import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PresentationSmartInfo } from '@lib/portal-lib/pbx/pbx-presentation-smart';
import { SmartItemFields } from '@lib/portal-lib/pbx/smart-item-fields';
import { FlowBitrix, SideFlowName } from '../../shared/side-flow';
import { PresentationFlowJobData } from '../dto/presentation-flow-job.dto';

/** Сырой словарь полей элемента crm.item — то, что уезжает в Битрикс. */
export type BxRow = Record<string, unknown>;

/**
 * Имя потока для общих side-flow-сервисов: они логируют под ним, и канал
 * грепается по потоку. Имя то же, что у гейта повтора (`pres-flow`) —
 * одно имя потока на все его следы в логах.
 */
export const PRES_FLOW: SideFlowName = 'pres-flow';

/**
 * Всё, что нужно одному прогону джоба, одним объектом (зеркало ZprFlowRun).
 *
 * Раньше эти пятеро ездили позиционными аргументами; с приходом живых
 * полей элемента (ответы портальной анкеты) их стало шесть, и порядок
 * начал бы значить больше, чем смысл.
 */
export interface PresentationFlowRun {
    bitrix: FlowBitrix;
    portal: PortalModel;
    info: PresentationSmartInfo;
    job: PresentationFlowJobData;
    /** Таймзона портала — в ней живут все даты элемента. */
    tz: string;
    /** Текущий момент в формате элемента. */
    now: string;
    /**
     * ЖИВЫЕ поля элемента (`crm.item.fields`) — адреса портальной анкеты.
     * null — читать не понадобилось (ответов нет) либо не удалось: тогда
     * ответы просто не пишутся, всё остальное работает как прежде.
     */
    itemFields: SmartItemFields | null;
}
