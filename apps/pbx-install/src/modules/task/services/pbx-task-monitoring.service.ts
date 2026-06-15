import { Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { ITaskUserField } from '@/modules/bitrix';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { InstallEntityFieldDto, TASK_FIELD_PREFIX } from '../../shared';
import { PbxTaskParseService } from './pbx-task-parse.service';
import {
    BxTaskFieldDto,
    BxTaskFieldsListResponseDto,
    PbxTaskFieldStatus,
    PbxTaskMergedFieldDto,
    PbxTaskMonitoringAllResponseDto,
    PbxTaskMonitoringResultDto,
    PbxTaskMonitoringSummaryDto,
} from '../dto/pbx-task-monitoring.dto';

/**
 * 2-слойное представление полей задачи: шаблон-константа (TASK_FIELDS) и живой
 * Bitrix (UF_TASK_*). У задач нет сущности в PortalDB, поэтому слоя БД нет.
 * Только чтение.
 *
 * `@Injectable`, но Bitrix-инстанс не хранится в `this` — берётся локально по
 * domain (правило CLAUDE.md про race condition).
 */
@Injectable()
export class PbxTaskMonitoringService {
    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly parseService: PbxTaskParseService,
    ) {}

    /** Живые UF_TASK_-поля Bitrix портала. */
    async listBitrixFields(
        domain: string,
    ): Promise<BxTaskFieldsListResponseDto> {
        const fields = await this.loadBitrixFields(domain);
        return { domain, fields: fields as unknown as BxTaskFieldDto[] };
    }

    /** Склейка шаблон/Bitrix по одному порталу (домену). */
    async getByDomain(domain: string): Promise<PbxTaskMonitoringResultDto> {
        const bxFields = await this.loadBitrixFields(domain);
        const templates = this.parseService.getFields();
        const mergedNames = new Set<string>();

        const mergedFields: PbxTaskMergedFieldDto[] = templates.map(
            template => {
                const name = this.fullName(template.bxFieldName);
                mergedNames.add(name);
                const bx = bxFields.find(f => f.FIELD_NAME === name) ?? null;
                return {
                    name,
                    template: template as InstallEntityFieldDto,
                    bx: bx as unknown as BxTaskFieldDto | null,
                    status: this.status(bx),
                };
            },
        );

        const bitrixFieldsWithoutTemplate = bxFields
            .filter(f => !mergedNames.has(f.FIELD_NAME))
            .map(f => f as unknown as BxTaskFieldDto);

        return {
            domain,
            summary: this.buildSummary(
                mergedFields,
                bitrixFieldsWithoutTemplate,
            ),
            mergedFields,
            bitrixFieldsWithoutTemplate,
        };
    }

    /** Агрегированная картина по всем порталам. */
    async getAll(): Promise<PbxTaskMonitoringAllResponseDto> {
        const portals = (await this.portalService.getPortals()) ?? [];
        const perPortal: PbxTaskMonitoringResultDto[] = [];
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

    private async loadBitrixFields(domain: string): Promise<ITaskUserField[]> {
        const { bitrix } = await this.pbxService.init(domain);
        const { result } = await bitrix.taskUserField.getList({ SORT: 'ASC' });
        return (result ?? []).filter(f =>
            f.FIELD_NAME?.startsWith(TASK_FIELD_PREFIX),
        );
    }

    private buildSummary(
        merged: PbxTaskMergedFieldDto[],
        untracked: BxTaskFieldDto[],
    ): PbxTaskMonitoringSummaryDto {
        return {
            total: merged.length,
            installed: merged.filter(m => m.status === 'installed').length,
            notInstalled: merged.filter(m => m.status === 'not_installed')
                .length,
            untracked: untracked.length,
        };
    }

    private status(bx: ITaskUserField | null): PbxTaskFieldStatus {
        return bx ? 'installed' : 'not_installed';
    }

    private fullName(name: string): string {
        return name.startsWith(TASK_FIELD_PREFIX)
            ? name
            : `${TASK_FIELD_PREFIX}${name}`;
    }
}
