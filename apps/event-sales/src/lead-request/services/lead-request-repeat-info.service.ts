import { Injectable, Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { ActiveStaffService } from '../../shared/active-staff';
import { UserNameResolver } from '../../shared/lead-request/user-name.resolver';
import { isRepeatRequestDeal } from '../../shared/lead-request/repeat-request.util';
import { parseUserIds } from '../../sales-hooks/lead-to-work/lib/round-robin-exclusion.util';
import { LeadRequestRepeatDto } from '../dto/lead-request-repeat.dto';

type BxRow = Record<string, unknown>;

/**
 * Блок «повторное обращение» карточки заявки (решение владельца
 * 28.09.2026): сотрудник видит, что работа по клиенту уже велась, на какой
 * стадии она была и на ком висела — в том числе «сотрудника нет в
 * карусели» (уволен, в отделе неработающих или исключён из круга).
 *
 * Отдельно от LeadRequestService: карточка читает только лид, а здесь
 * своё чтение сделки и проверка сотрудника. Сбой — блок не показывается
 * (null), карточка остаётся рабочей.
 *
 * @Injectable без состояния: bitrix/portal приходят в вызов.
 */
@Injectable()
export class LeadRequestRepeatInfoService {
    private readonly logger = new Logger(LeadRequestRepeatInfoService.name);

    constructor(
        private readonly activeStaff: ActiveStaffService,
        private readonly appSettings: PortalAppSettingsService,
        private readonly userNames: UserNameResolver,
    ) {}

    async build(
        domain: string,
        bitrix: BitrixService,
        portal: PortalModel,
        leadId: number,
        baseDealId: number | null,
    ): Promise<LeadRequestRepeatDto | null> {
        if (!baseDealId) return null;
        try {
            const deal = (await bitrix.deal.get(baseDealId))?.result as
                | BxRow
                | undefined;
            if (!deal) return null;

            // Правило одно с SLA: чужой первоисточник либо лид — среди
            // присоединённых к сделке без первоисточника.
            const isRepeat = isRepeatRequestDeal(portal, deal, leadId);
            if (!isRepeat) return null;

            const returnStage = this.fieldText(portal, deal, 'op_return_stage');
            const stageBefore = returnStage || this.text(deal.STAGE_ID);
            const responsibleId = Number(deal.ASSIGNED_BY_ID) || 0;

            return {
                isRepeat,
                mainDealId: baseDealId,
                mainDealTitle: this.text(deal.TITLE) || null,
                stageBeforeName: this.stageName(portal, stageBefore),
                willReturnStage: returnStage !== '',
                responsible: responsibleId
                    ? await this.responsible(domain, bitrix, responsibleId)
                    : null,
            };
        } catch (error) {
            this.logger.warn(
                `[repeat-card] ${domain} лид ${leadId}: блок не собран — ${(error as Error).message}`,
            );
            return null;
        }
    }

    private async responsible(
        domain: string,
        bitrix: BitrixService,
        userId: number,
    ): Promise<LeadRequestRepeatDto['responsible']> {
        const [active, names, excluded] = await Promise.all([
            this.activeStaff.activeUserIds(domain, bitrix, [userId]),
            this.userNames.resolve(domain, bitrix, [userId]),
            this.excludedIds(domain),
        ]);
        const isActive = active.has(userId);
        return {
            id: userId,
            name: names[userId] ?? null,
            active: isActive,
            inRotation: isActive && !excluded.includes(userId),
        };
    }

    private async excludedIds(domain: string): Promise<number[]> {
        try {
            const settings = await this.appSettings.resolve(
                domain,
                EnumPortalAppCode.eventSales,
            );
            return parseUserIds(settings.leadIntakeRoundRobinExcludedUserIds);
        } catch {
            return [];
        }
    }

    /** Название стадии воронки ОП по STAGE_ID (`C31:WON`); нет — null. */
    private stageName(portal: PortalModel, stageId: string): string | null {
        if (!stageId) return null;
        const category = portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        const stage = category?.stages.find(
            item => `C${category.bitrixId}:${item.bitrixId}` === stageId,
        );
        return stage ? stage.name || stage.title || null : null;
    }

    private fieldText(
        portal: PortalModel,
        deal: BxRow,
        code: keyof typeof PBX_SALES_EVENT_FIELD_CODES,
    ): string {
        const field = portal.getEntityFieldByCode(
            'deal',
            PBX_SALES_EVENT_FIELD_CODES[code],
        );
        return field ? this.text(deal[portal.getFieldBitrixId(field)]) : '';
    }

    private text(raw: unknown): string {
        return typeof raw === 'string' || typeof raw === 'number'
            ? String(raw).trim()
            : '';
    }
}
