import { Injectable, NotFoundException } from '@nestjs/common';

import { DepartmentBitrixService } from '@/modules/bitrix/domain/department/services/department-bitrxi.service';
import { IBXDepartment } from '@/modules/bitrix/domain/interfaces/bitrix.interface';
import { PBXService } from '@/modules/pbx';
import {
    PortalDepartamentResponseDto,
    PortalDepartamentService,
} from '@lib/portal-lib/pbx-domain/portal-departament';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';

export interface PbxDepartamentMergedItem {
    bitrixId: number;
    p: PortalDepartamentResponseDto | null;
    bx: IBXDepartment | null;
}

export interface PbxDepartamentMonitoringResult {
    merged: PbxDepartamentMergedItem[];
    portalWithoutMerged: PortalDepartamentResponseDto[];
    bitrixWithoutMerged: IBXDepartment[];
}

/**
 * Мониторинг отделов: смерженное состояние PortalDB (`departaments`) и
 * read-only списка отделов Bitrix (`department.get`) по bitrixId.
 * В Bitrix ничего не пишется — только чтение для обогащения.
 */
@Injectable()
export class PbxDepartamentMonitoringService {
    constructor(
        private readonly pbxService: PBXService,
        private readonly portalDepartamentService: PortalDepartamentService,
        private readonly portalService: PortalStoreService,
    ) {}

    /**
     * Список всех отделов портала из Bitrix (`department.get`), read-only.
     * Нужен, чтобы выбрать конкретный отдел и назначить его как ОП (sales) / ОС (service).
     */
    async getAllBitrixDepartments(domain: string): Promise<IBXDepartment[]> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const { bitrix } = await this.pbxService.init(domain);
        return new DepartmentBitrixService(bitrix).getDepartmentsAll();
    }

    async getPbxDepartamentData(
        domain: string,
    ): Promise<PbxDepartamentMonitoringResult> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const portalId = Number(portal.id);

        // локальный инстанс битрикса по domain — НЕ держим в this (race condition)
        const { bitrix } = await this.pbxService.init(domain);

        const portalDepartaments =
            await this.portalDepartamentService.findByPortalId(portalId);
        const bitrixDepartaments = await new DepartmentBitrixService(
            bitrix,
        ).getDepartmentsAll();

        const merged: PbxDepartamentMergedItem[] = [];
        for (const p of portalDepartaments) {
            const bx =
                bitrixDepartaments.find(d => Number(d.ID) === p.bitrixId) ??
                null;
            if (bx) {
                merged.push({ bitrixId: p.bitrixId, p, bx });
            }
        }

        const portalWithoutMerged = portalDepartaments.filter(
            p => !merged.some(m => m.p?.id === p.id),
        );
        const bitrixWithoutMerged = bitrixDepartaments.filter(
            d => !merged.some(m => Number(m.bx?.ID) === Number(d.ID)),
        );

        return {
            merged,
            portalWithoutMerged,
            bitrixWithoutMerged,
        };
    }
}
