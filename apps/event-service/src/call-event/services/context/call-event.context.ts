import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { CallingEventDto } from '../../dto/calling-event.dto';
import { CallingResultStatus } from '../../types/calling-event.enum';
import { ICallEventInitContext } from '../init/call-event-init.types';

/**
 * Состояние обработки события звонка: входной DTO + загруженные сущности
 * (init) + вычисленные флаги. Не держит инстанс Bitrix (CLAUDE.md) — он
 * передаётся в каждый flow-сервис параметром.
 */
export class CallEventContext {
    constructor(
        public readonly dto: CallingEventDto,
        public readonly portal: PortalModel,
        public readonly init: ICallEventInitContext,
        public readonly nowDate: Date = new Date(),
    ) {}

    // === Identity ===
    get domain(): string {
        return this.dto.domain;
    }
    get companyId(): number {
        return Number(
            this.dto.bx?.companyId ?? this.dto.placement?.options?.ID ?? 0,
        );
    }
    get dealId(): number {
        return Number(this.dto.bx?.dealId ?? 0);
    }
    get taskGroupId(): number | undefined {
        return this.dto.bx?.taskGroupId;
    }
    get currentUserId(): number {
        return Number(this.dto.departament?.currentUser?.ID ?? 0);
    }

    // === Result flags ===
    get resultStatus(): CallingResultStatus | undefined {
        return this.dto.report?.resultStatus;
    }
    get isNoResult(): boolean {
        return this.resultStatus === CallingResultStatus.noresult;
    }

    // === Plan flags ===
    get planIsActive(): boolean {
        return Boolean(this.dto.plan?.isActive);
    }
    get planIsExpired(): boolean {
        return Boolean(this.dto.plan?.isExpired);
    }

    // === CRM links ===
    /** Массив CRM-привязок (CO_<company>, D_<deal>) текущего события. */
    crmLinks(withContactId?: number): string[] {
        const links: string[] = [];
        if (this.companyId) links.push(`CO_${this.companyId}`);
        if (this.dealId) links.push(`D_${this.dealId}`);
        if (withContactId) links.push(`C_${withContactId}`);
        return links;
    }
}
