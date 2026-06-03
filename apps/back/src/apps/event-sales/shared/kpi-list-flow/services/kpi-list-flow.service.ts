import { BitrixService } from '@/modules/bitrix';
import { IPBXList } from '@/modules/portal/interfaces/portal.interface';
import { PortalModel } from '@/modules/portal/services/portal.model';
import { Logger } from '@nestjs/common';
import { ColdHookBatchGroupBuffer } from '../../../cold-hook/services/batch/cold-hook-batch-group-buffer';
import { KpiEventItemModel } from '../models/kpi-event-item.model';
import { KpiEventPayload } from '../type/kpi-event-payload.type';

/**
 * Создаёт элементы в списках `sales_kpi` и `sales_history` для одного
 * KPI-события (план/отчёт/перенос/...).
 *
 * Бизнес-нюансы (event_type, перспективность, текст комментария) сюда не
 * протекают: сервис принимает уже подготовленный {@link KpiEventPayload}
 * и просто превращает его в команды Bitrix через
 * {@link KpiEventItemModel}.
 *
 * NOTE: класс намеренно НЕ `@Injectable`. Создаётся через `new` рядом с
 * `BitrixService`, чтобы избежать race condition c заинъекченным
 * `this.bitrix` (см. CLAUDE.md).
 */
export class KpiListFlowService {
    private readonly logger = new Logger(KpiListFlowService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    /**
     * Ставит в очередь `buffer` команды добавления элемента в KPI и
     * History списки портала. Если один из списков не настроен — он
     * пропускается; ошибки портала не валят весь батч.
     *
     * @param payload  логические значения события (см. {@link KpiEventPayload})
     * @param companyId  ID компании-владельца (для уникальности кода элемента)
     * @param buffer  батч-буфер cold-hook group
     */
    flow(
        payload: KpiEventPayload,
        companyId: string | number,
        buffer: ColdHookBatchGroupBuffer,
    ): void {
        const lists = this.collectLists();
        if (lists.length === 0) {
            this.logger.warn('Списки sales_kpi/sales_history не настроены');
            return;
        }

        const uniqueSuffix = this.generateUniqueSuffix();

        lists.forEach(list => {
            const fields = new KpiEventItemModel(list, payload).toFields();
            const cmdCode = `add_list_item_${list.type}_${companyId}_${uniqueSuffix}`;
            const elementCode = `${list.type}_${companyId}_${uniqueSuffix}`;

            buffer.queue(() =>
                this.bitrix.batch.listItem.add(cmdCode, {
                    IBLOCK_ID: String(list.bitrixId),
                    ELEMENT_CODE: elementCode,
                    FIELDS: fields,
                }),
            );
        });
    }

    private collectLists(): IPBXList[] {
        const lists: IPBXList[] = [];
        const kpi = this.portal.getListByCode('sales_kpi');
        const history = this.portal.getListByCode('sales_history');
        if (kpi) lists.push(kpi);
        if (history) lists.push(history);
        return lists;
    }

    private generateUniqueSuffix(): string {
        return `${Date.now().toString(36)}_${Math.random()
            .toString(36)
            .slice(2, 10)}`;
    }
}
