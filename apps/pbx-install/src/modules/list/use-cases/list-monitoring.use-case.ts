import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import {
    PortalListEntity,
    PortalListService,
} from '@lib/portal-lib/pbx-domain';
import { IBXList, IBXListFieldDescription } from '@/modules/bitrix';
import {
    ListTemplateSource,
    ParseListService,
} from '../services/parse/parse-list.service';
import { List } from '../type/parse.type';
import {
    fullListFieldCode,
    listFieldCodeCandidates,
} from '../lib/list-field-code.util';
import { toPortalListFieldDto } from '../lib/list-response.mapper';
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
        const bxFieldsByCode = await this.fetchBxFields(domain, bitrixId);
        const listKey = { type: template.type, group: template.group };

        return template.fields.map(field => {
            const fullCode = fullListFieldCode(listKey, field.code);
            // Bitrix: по кандидатам кода (полный легаси, btx-код шаблона, короткий)
            const candidates = listFieldCodeCandidates(listKey, field);
            let bxRef: { fieldId: string; d: IBXListFieldDescription } | null =
                null;
            for (const candidate of candidates) {
                const found = bxFieldsByCode.get(candidate);
                if (found) {
                    bxRef = found;
                    break;
                }
            }
            // PortalDB: code хранится полным; короткий — fallback для старых записей
            const dbField =
                db?.fields.find(
                    f => f.code === fullCode || f.code === field.code,
                ) ?? null;
            const fieldId = bxRef?.fieldId ?? null;
            const dbFieldId = dbField ? dbField.bitrixCamelId : null;
            return {
                code: field.code,
                fullCode,
                name: field.name,
                bxFieldName: field.bxFieldName,
                type: String(field.type),
                inBitrix: bxRef !== null,
                fieldId,
                bitrixCode: bxRef ? String(bxRef.d.CODE ?? '') : null,
                bitrixName: bxRef ? String(bxRef.d.NAME ?? '') : null,
                bitrixType: bxRef ? String(bxRef.d.TYPE ?? '') : null,
                bitrixMultiple: bxRef ? bxRef.d.MULTIPLE === 'Y' : null,
                inDb: dbField !== null,
                dbCode: dbField ? dbField.code : null,
                dbFieldId,
                inSync:
                    fieldId !== null &&
                    dbFieldId !== null &&
                    fieldId === dbFieldId,
                templateItems: (field.list ?? []).map(item => ({
                    code: item.CODE,
                    value: item.VALUE,
                    sort: item.SORT,
                })),
                bitrix: bxRef
                    ? {
                          fieldId: bxRef.fieldId,
                          code: bxRef.d.CODE ? String(bxRef.d.CODE) : null,
                          name: String(bxRef.d.NAME ?? ''),
                          type: String(bxRef.d.TYPE ?? ''),
                          multiple: bxRef.d.MULTIPLE === 'Y',
                          isRequired: bxRef.d.IS_REQUIRED === 'Y',
                          sort:
                              bxRef.d.SORT != null
                                  ? String(bxRef.d.SORT)
                                  : null,
                          items: Object.entries(
                              bxRef.d.DISPLAY_VALUES_FORM ?? {},
                          ).map(([id, value]) => ({ id, value })),
                      }
                    : null,
                db: dbField ? toPortalListFieldDto(dbField) : null,
            };
        });
    }

    /** UPPERCASE CODE свойства → { FIELD_ID, описание }; пусто, если списка нет. */
    private async fetchBxFields(
        domain: string,
        bitrixId: number | null,
    ): Promise<Map<string, { fieldId: string; d: IBXListFieldDescription }>> {
        const map = new Map<
            string,
            { fieldId: string; d: IBXListFieldDescription }
        >();
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
                    map.set(String(description.CODE).toUpperCase(), {
                        fieldId,
                        d: description,
                    });
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
