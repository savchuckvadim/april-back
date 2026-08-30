import { Logger } from '@nestjs/common';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { ZprSmartInfo } from '@lib/portal-lib/pbx/pbx-zpr-smart';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { FlowBitrix } from '../../shared/side-flow';
import { ZprFlowJobData } from '../dto/zpr-flow-job.dto';
import { BxRow } from '../types/zpr-flow-run.type';

/**
 * Обратная ссылка на элемент ЗПР в поле `op_zprs` сделки и компании.
 *
 * Зачем отдельным классом: это единственное место потока, которое пишет НЕ
 * в элемент смарта, а в чужие карточки, и делает это по портальному
 * реестру полей (PortalModel), а не по конфигу смарта. Ответственность
 * своя — и падать она обязана отдельно от записи самого элемента.
 *
 * `bitrix`/`portal` приходят в конструктор (класс создаётся на прогон
 * джоба, не инжектится) — правило CLAUDE.md про `this.bitrix`.
 */
export class ZprBacklinkService {
    private readonly logger = new Logger(ZprBacklinkService.name);

    constructor(
        private readonly bitrix: FlowBitrix,
        private readonly portal: PortalModel,
    ) {}

    /** Дописать ссылку на элемент в op_zprs сделки и компании (append). */
    async appendOpZprs(
        info: ZprSmartInfo,
        job: ZprFlowJobData,
        elementId: number,
    ): Promise<void> {
        // Динамическая привязка crm-поля: T{entityTypeId в hex}_{id}.
        const ref = `T${info.entityTypeId.toString(16)}_${elementId}`;

        const targets: Array<{
            entity: 'deal' | 'company';
            id: number | null;
            read: (id: number, select: string[]) => Promise<unknown>;
            update: (id: number, fields: BxRow) => Promise<unknown>;
        }> = [
            {
                entity: 'deal',
                id: job.baseDealId,
                read: (id, select) => this.bitrix.deal.get(id, select),
                update: (id, fields) =>
                    this.bitrix.deal.update(id, fields as never),
            },
            {
                entity: 'company',
                id: job.companyId,
                read: (id, select) =>
                    this.bitrix.company.get(id, select as never),
                update: (id, fields) =>
                    this.bitrix.company.update(id, fields as never),
            },
        ];

        for (const target of targets) {
            if (!target.id) continue;
            const field = this.portal.getEntityFieldByCode(
                target.entity,
                PBX_SALES_EVENT_FIELD_CODES.op_zprs,
            );
            if (!field) continue;
            const name = this.portal.getFieldBitrixId(field);
            try {
                const response = (await target.read(target.id, [
                    'ID',
                    name,
                ])) as { result?: BxRow } | BxRow | null;
                const row =
                    (response as { result?: BxRow })?.result ??
                    (response as BxRow | null);
                const raw = row?.[name];
                const current = Array.isArray(raw) ? raw.map(String) : [];
                if (current.includes(ref)) continue;
                await target.update(target.id, {
                    [name]: [...current, ref],
                });
            } catch (error) {
                // Обратная ссылка — удобство, не инвариант: элемент и так
                // находится по своим crm-полям.
                this.logger.warn(
                    `[zpr-flow] op_zprs на ${target.entity} ${target.id} не записан: ${(error as Error).message}`,
                );
            }
        }
    }
}
