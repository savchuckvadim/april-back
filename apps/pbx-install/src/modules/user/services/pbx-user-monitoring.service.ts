import { Injectable, NotFoundException } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { IBXField } from '@/modules/bitrix';
import { PbxFieldEntityDto, PbxUserService } from '@lib/portal-lib/pbx-domain';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { InstallEntityFieldDto, USER_FIELD_PREFIX } from '../../shared';
import { PbxUserParseService } from './pbx-user-parse.service';
import { BxUserFieldDto } from '../dto/pbx-user-bitrix.dto';
import {
    PbxFieldSyncStatus,
    PbxUserMergedFieldDto,
    PbxUserMonitoringAllResponseDto,
    PbxUserMonitoringResultDto,
    PbxUserMonitoringSummaryDto,
} from '../dto/pbx-user-monitoring.dto';

/**
 * 3-слойное представление полей пользователя: шаблон-константа (USER_FIELDS) /
 * PortalDB (BtxUser.fields) / живой Bitrix (UF_USR_*). Только чтение.
 *
 * `@Injectable`, но Bitrix-инстанс не хранится в `this` — берётся локально по
 * domain (правило CLAUDE.md про race condition).
 */
@Injectable()
export class PbxUserMonitoringService {
    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly pbxUserService: PbxUserService,
        private readonly parseService: PbxUserParseService,
    ) {}

    /** Полная картина по одному порталу (домену). */
    async getByDomain(domain: string): Promise<PbxUserMonitoringResultDto> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException(
                `Portal not found for domain ${domain}`,
            );
        }
        const portalId = Number(portal.id);
        const { userId, dbFields } = await this.loadDbFields(portalId);
        const bxFields = await this.loadBitrixFields(domain);

        const {
            mergedFields,
            dbFieldsWithoutMerged,
            bitrixFieldsWithoutMerged,
        } = this.merge(dbFields, bxFields);

        return {
            domain,
            portalId,
            userId,
            summary: this.buildSummary(mergedFields),
            mergedFields,
            dbFieldsWithoutMerged,
            bitrixFieldsWithoutMerged,
        };
    }

    /** Агрегированная картина по всем порталам. */
    async getAll(): Promise<PbxUserMonitoringAllResponseDto> {
        const portals = (await this.portalService.getPortals()) ?? [];
        const perPortal: PbxUserMonitoringResultDto[] = [];
        const errors: { domain: string; error: string }[] = [];
        for (const portal of portals) {
            const domain = portal.domain;
            if (!domain) continue;
            try {
                perPortal.push(await this.getByDomain(domain));
            } catch (e) {
                errors.push({
                    domain,
                    error: e instanceof Error ? e.message : String(e),
                });
            }
        }
        return { perPortal, errors };
    }

    /** Поля пользователя из PortalDB + его userId (или пусто, если записи нет). */
    private async loadDbFields(
        portalId: number,
    ): Promise<{ userId: number | null; dbFields: PbxFieldEntityDto[] }> {
        try {
            const user = await this.pbxUserService.findByPortalId(
                String(portalId),
            );
            return { userId: Number(user.id), dbFields: user.fields };
        } catch (e) {
            if (e instanceof NotFoundException) {
                return { userId: null, dbFields: [] };
            }
            throw e;
        }
    }

    /** Живые UF_USR_-поля Bitrix портала. */
    private async loadBitrixFields(domain: string): Promise<IBXField[]> {
        const { bitrix } = await this.pbxService.init(domain);
        const { result } = await bitrix.user.listFields();
        return ((result ?? []) as unknown as IBXField[]).filter(f =>
            f.FIELD_NAME?.startsWith(USER_FIELD_PREFIX),
        );
    }

    /** Склейка шаблон/БД/Bitrix по полному имени UF_USR_*. */
    private merge(
        dbFields: PbxFieldEntityDto[],
        bxFields: IBXField[],
    ): {
        mergedFields: PbxUserMergedFieldDto[];
        dbFieldsWithoutMerged: PbxFieldEntityDto[];
        bitrixFieldsWithoutMerged: BxUserFieldDto[];
    } {
        const templates = this.parseService.getFields();
        const mergedNames = new Set<string>();
        const mergedFields = templates.map(template => {
            const name = this.fullName(template.bxFieldName);
            mergedNames.add(name);
            const db =
                dbFields.find(f => this.fullName(f.bitrixId) === name) ?? null;
            const bx = bxFields.find(f => f.FIELD_NAME === name) ?? null;
            return {
                name,
                template: template as InstallEntityFieldDto,
                db,
                bx: bx as unknown as BxUserFieldDto | null,
                status: this.status(db, bx),
            };
        });

        const dbFieldsWithoutMerged = dbFields.filter(
            f => !mergedNames.has(this.fullName(f.bitrixId)),
        );
        const bitrixFieldsWithoutMerged = bxFields
            .filter(f => !mergedNames.has(f.FIELD_NAME))
            .map(f => f as unknown as BxUserFieldDto);

        return {
            mergedFields,
            dbFieldsWithoutMerged,
            bitrixFieldsWithoutMerged,
        };
    }

    private buildSummary(
        merged: PbxUserMergedFieldDto[],
    ): PbxUserMonitoringSummaryDto {
        return {
            total: merged.length,
            synced: merged.filter(m => m.status === 'synced').length,
            missingInDb: merged.filter(m => m.status === 'missing_in_db')
                .length,
            missingInBitrix: merged.filter(
                m => m.status === 'missing_in_bitrix',
            ).length,
            onlyTemplate: merged.filter(m => m.status === 'only_template')
                .length,
        };
    }

    private status(
        db: PbxFieldEntityDto | null,
        bx: IBXField | null,
    ): PbxFieldSyncStatus {
        if (db && bx) return 'synced';
        if (!db && bx) return 'missing_in_db';
        if (db && !bx) return 'missing_in_bitrix';
        return 'only_template';
    }

    private fullName(name: string): string {
        return name.startsWith(USER_FIELD_PREFIX)
            ? name
            : `${USER_FIELD_PREFIX}${name}`;
    }
}
