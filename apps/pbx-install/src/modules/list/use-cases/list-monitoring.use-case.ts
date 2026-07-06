import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import {
    PortalListEntity,
    PortalListService,
} from '@lib/portal-lib/pbx-domain';
import { IBXList } from '@/modules/bitrix';
import {
    ListTemplateSource,
    ParseListService,
} from '../services/parse/parse-list.service';
import { List } from '../type/parse.type';
import {
    ListFieldMonitorRowDto,
    ListMonitorRowDto,
    ListMonitoringResponseDto,
    ListParseResponseDto,
    ListTemplateDto,
} from '../dto/list-response.dto';

/**
 * Эталон и смерженное состояние универсальных списков.
 *
 * Эталон = все существующие Excel-шаблоны (`install/<group>/list/<folder>/data.xlsx`),
 * комбинации folder × group перебираются, отсутствующие файлы пропускаются.
 *
 * Monitoring (по образцу RqMonitoringUseCase): эталон × Bitrix (`lists.get` +
 * `lists.field.get`) × PortalDB (`bitrixlists` + `bitrixfields`), по каждому
 * списку и полю — статусы inBitrix / inDb / inSync.
 */
@Injectable()
export class ListMonitoringUseCase {
    private readonly logger = new Logger(ListMonitoringUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly portalListService: PortalListService,
        private readonly parseListService: ParseListService,
    ) {}

    /** Предпросмотр эталона: все списки всех шаблонов. */
    async parse(): Promise<ListParseResponseDto> {
        const templates = await this.parseListService.getAllTemplates();
        return { lists: templates.map(t => this.toTemplateDto(t)) };
    }

    async monitoring(domain: string): Promise<ListMonitoringResponseDto> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const portalId = Number(portal.id);

        const { bitrix } = await this.pbxService.init(domain);
        const bxResponse = await bitrix.list.getList();
        const bxLists: IBXList[] = Array.isArray(bxResponse.result)
            ? bxResponse.result
            : [];
        const dbPortal =
            await this.portalListService.getListsByPortalDomain(domain);

        const templates = await this.parseListService.getAllTemplates();
        const lists: ListMonitorRowDto[] = [];
        for (const source of templates) {
            lists.push(
                await this.buildListRow(
                    domain,
                    source,
                    bxLists,
                    dbPortal.lists,
                ),
            );
        }
        return { domain, portalId, lists };
    }

    private async buildListRow(
        domain: string,
        source: ListTemplateSource,
        bxLists: IBXList[],
        dbLists: PortalListEntity[],
    ): Promise<ListMonitorRowDto> {
        const template = source.list;
        const db =
            dbLists.find(
                d => d.type === template.type && d.group === template.group,
            ) ?? null;
        const dbBitrixId = db ? db.bitrixId : null;

        // Сопоставление с Bitrix: по кандидатам кода, а если список создан
        // не нашим установщиком — по сохранённому в БД bitrixId (как в rq).
        const candidates = [
            template.code,
            `${template.group}_${template.type}`,
            template.type,
        ];
        const bx =
            bxLists.find(l =>
                candidates.includes(String(l.CODE ?? l.IBLOCK_CODE ?? '')),
            ) ??
            (dbBitrixId != null
                ? bxLists.find(l => Number(l.ID) === dbBitrixId)
                : undefined);
        const bitrixId = bx ? Number(bx.ID) : null;

        const fields = await this.buildFieldRows(
            domain,
            template,
            bitrixId,
            db,
        );

        return {
            sourceListName: source.listName,
            sourceGroup: source.group,
            type: template.type,
            group: template.group,
            code: template.code,
            name: template.name,
            inBitrix: bx !== undefined,
            bitrixId,
            inDb: db !== null,
            dbBitrixId,
            inSync: bx !== undefined && db !== null && bitrixId === dbBitrixId,
            fields,
        };
    }

    private async buildFieldRows(
        domain: string,
        template: List,
        bitrixId: number | null,
        db: PortalListEntity | null,
    ): Promise<ListFieldMonitorRowDto[]> {
        const bxFieldIdByCode = await this.fetchBxFieldIds(domain, bitrixId);

        return template.fields.map(field => {
            const bxCode = field.bxFieldName.toUpperCase();
            const fieldId = bxFieldIdByCode.get(bxCode) ?? null;
            const dbField = db?.fields.find(f => f.code === field.code) ?? null;
            const dbFieldId = dbField ? dbField.bitrixCamelId : null;
            return {
                code: field.code,
                name: field.name,
                bxFieldName: field.bxFieldName,
                inBitrix: fieldId !== null,
                fieldId,
                inDb: dbField !== null,
                dbFieldId,
                inSync:
                    fieldId !== null &&
                    dbFieldId !== null &&
                    fieldId === dbFieldId,
            };
        });
    }

    /** CODE свойства → FIELD_ID (PROPERTY_N) из Bitrix; пусто, если списка нет. */
    private async fetchBxFieldIds(
        domain: string,
        bitrixId: number | null,
    ): Promise<Map<string, string>> {
        const map = new Map<string, string>();
        if (bitrixId === null) {
            return map;
        }
        const { bitrix } = await this.pbxService.init(domain);
        try {
            const response = await bitrix.list.getListFields({
                IBLOCK_ID: bitrixId,
            });
            for (const [fieldId, description] of Object.entries(
                response.result ?? {},
            )) {
                if (description.CODE) {
                    map.set(String(description.CODE).toUpperCase(), fieldId);
                }
            }
        } catch (e) {
            this.logger.warn(
                `lists.field.get failed for ${domain} IBLOCK_ID=${bitrixId}: ${String(e)}`,
            );
        }
        return map;
    }

    private toTemplateDto(source: ListTemplateSource): ListTemplateDto {
        const list = source.list;
        return {
            id: list.id,
            sourceListName: source.listName,
            sourceGroup: source.group,
            type: list.type,
            group: list.group,
            name: list.name,
            code: list.code,
            order: list.order,
            fields: list.fields,
        };
    }
}
