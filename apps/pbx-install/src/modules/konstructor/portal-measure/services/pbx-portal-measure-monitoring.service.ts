import { Injectable, NotFoundException } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import {
    MeasureService,
    PortalMeasureService,
} from '@lib/portal-lib/konstructor';
import { PortalMeasureResponseDto } from '../dto/portal-measure-response.dto';
import { MeasureResponseDto } from '../dto/measure-response.dto';
import {
    BxMeasureDto,
    PbxMeasureDto,
    PbxMeasureMonitoringResponseDto,
} from '../dto/pbx-measure-monitoring-response.dto';
import { BxMeasure, BxMeasureRow, toBxMeasure } from '../types/bx-measure.type';

/**
 * Сводка единиц измерения портала: `pbx = portalDB + bitrix`.
 *
 * Берёт `portal_measure` из PortalDB и реальные единицы измерения из Bitrix клиента
 * (`crm.measure.list`), сопоставляет по `portal_measure.bitrixId` ↔ Bitrix `ID`.
 * Возвращает единый «pbx»-тип, по которому фронт рисует и текущее состояние, и форму.
 *
 * Построена по образцу {@link PbxDealCategoryMonitoringService}.
 */
@Injectable()
export class PbxPortalMeasureMonitoringService {
    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly portalMeasureService: PortalMeasureService,
        private readonly measureService: MeasureService,
    ) {}

    async getByDomain(
        domain: string,
    ): Promise<PbxMeasureMonitoringResponseDto> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException(
                `Portal with domain ${domain} not found`,
            );
        }
        const portalId = Number(portal.id);

        const portalMeasures = (
            await this.portalMeasureService.findByPortalId(portalId)
        ).map(pm => new PortalMeasureResponseDto(pm));
        const globalMeasures = (await this.measureService.findMany()).map(
            m => new MeasureResponseDto(m),
        );
        const bxMeasures = await this.loadBitrixMeasures(domain);

        const merged: PbxMeasureDto[] = [];
        const matchedBxIds = new Set<number>();

        for (const portalMeasure of portalMeasures) {
            const bx =
                bxMeasures.find(b => matchMeasure(portalMeasure, b)) ?? null;
            if (bx) {
                matchedBxIds.add(bx.id);
            }
            merged.push({
                key: keyOf(portalMeasure, bx),
                portal: portalMeasure,
                bitrix: bx,
            });
        }

        // Единицы измерения Bitrix без зеркала в PortalDB — показываем со стороны bx.
        for (const bx of bxMeasures) {
            if (matchedBxIds.has(bx.id)) continue;
            merged.push({ key: String(bx.id), portal: null, bitrix: bx });
        }

        return {
            mergedMeasures: merged,
            portalMeasuresWithoutMerged: merged
                .filter(m => m.portal && !m.bitrix)
                .map(m => m.portal as PortalMeasureResponseDto),
            bitrixMeasuresWithoutMerged: merged
                .filter(m => !m.portal && m.bitrix)
                .map(m => m.bitrix as BxMeasureDto),
            globalMeasures,
        };
    }

    private async loadBitrixMeasures(domain: string): Promise<BxMeasure[]> {
        const { bitrix } = await this.pbxService.init(domain);
        const res = (await bitrix.api.call('crm.measure.list', {})) as {
            result?: { measures?: BxMeasureRow[] };
        };
        const rows = res.result?.measures ?? [];
        return rows.map(toBxMeasure);
    }
}

/** Сопоставление портальной и битрикс-единицы по `bitrixId` ↔ Bitrix `ID`. */
function matchMeasure(p: PortalMeasureResponseDto, bx: BxMeasure): boolean {
    if (!p.bitrixId) {
        return false;
    }
    return String(p.bitrixId).trim() === String(bx.id).trim();
}

/** Ключ строки: bitrixId портальной единицы; fallback — id Bitrix или id портальной. */
function keyOf(p: PortalMeasureResponseDto, bx: BxMeasure | null): string {
    if (p.bitrixId) {
        return String(p.bitrixId);
    }
    return bx ? String(bx.id) : String(p.id);
}
