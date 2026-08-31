import { Logger } from '@nestjs/common';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PresentationSmartInfo } from '@lib/portal-lib/pbx/pbx-presentation-smart';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { FlowBitrix } from '../../shared/side-flow';
import { PresentationFlowJobData } from '../dto/presentation-flow-job.dto';
import { BxRow } from '../types/presentation-flow-run.type';

/**
 * ОБРАТНАЯ ссылка на элемент презентации в `op_presentations` базовой
 * сделки и компании (append) — зеркало ZprBacklinkService.
 *
 * Поле в реестре pbx есть, но на портале его может не быть — тогда ссылки
 * просто нет: элемент и так находится по своим crm-полям. Обратная
 * ссылка — удобство, не инвариант: её ошибка не роняет джоб.
 *
 * `bitrix`/`portal` приходят в конструктор (класс создаётся на прогон
 * джоба, а не инжектится) — правило CLAUDE.md про this.bitrix.
 */
export class PresBacklinkService {
    private readonly logger = new Logger(PresBacklinkService.name);

    constructor(
        private readonly bitrix: FlowBitrix,
        private readonly portal: PortalModel,
    ) {}

    async appendOpPresentations(
        info: PresentationSmartInfo,
        job: PresentationFlowJobData,
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
                PBX_SALES_EVENT_FIELD_CODES.op_presentations,
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
                // Обратная ссылка — удобство, не инвариант.
                this.logger.warn(
                    `[presentation-flow] op_presentations на ${target.entity} ${target.id} не записан: ${(error as Error).message}`,
                );
            }
        }
    }
}
