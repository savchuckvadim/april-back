import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { ZprSmartInfo } from '@lib/portal-lib/pbx/pbx-zpr-smart';
import { SmartItemFields } from '@lib/portal-lib/pbx/smart-item-fields';
import { FlowBitrix } from '../../shared/side-flow';
import { ZprFlowJobData } from '../dto/zpr-flow-job.dto';

/**
 * Строка Битрикса «как пришла»: состав ключей элемента смарта зависит от
 * портала (ufCrm{typeId}...), и статически он не известен ни здесь, ни в
 * зеркальном потоке презентаций.
 */
export type BxRow = Record<string, unknown>;

/**
 * Всё, что нужно одному прогону джоба, одним объектом (зеркало
 * PresentationFlowRun): с приходом живых полей элемента позиционных
 * аргументов стало шесть, и порядок начал бы значить больше, чем смысл.
 *
 * Собирается ОДИН раз в {@link ZprFlowUseCase} и дальше только читается —
 * подсервисы потока (writer/lookup/builder) им обмениваются вместо того,
 * чтобы каждый заново тянуть портал, таймзону и поля элемента.
 */
export interface ZprFlowRun {
    bitrix: FlowBitrix;
    portal: PortalModel;
    info: ZprSmartInfo;
    job: ZprFlowJobData;
    /** Таймзона портала — в ней живут все даты элемента. */
    tz: string;
    /** Текущий момент в формате элемента. */
    now: string;
    /**
     * ЖИВЫЕ поля элемента (`crm.item.fields`) — адреса портальной анкеты.
     * null — читать не понадобилось (ответов нет) либо не удалось.
     */
    itemFields: SmartItemFields | null;
}
