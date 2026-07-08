import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { PortalListService } from '@lib/portal-lib/pbx-domain';
import { bigintConvertToNumber } from '@/shared';
import { ParseListService } from '../services/parse/parse-list.service';
import { List, ListFolderEnum, ListGroupEnum } from '../type/parse.type';
import { BxListInstallService } from '../services/install/bx-list-install.service';
import { BxListFieldsInstallService } from '../services/install/bx-list-fields-install.service';
import {
    IPbxListFieldInstallData,
    PortalListFieldInstallService,
} from '../services/install/portal-list-field-install.service';
import {
    InstallListsResponseDto,
    InstalledListResultDto,
} from '../dto/list-response.dto';
import {
    emptyFieldsInstallResult,
    toFieldsInstallResultDto,
} from '../lib/list-response.mapper';

/**
 * «Толстый» оркестратор установки списка целиком (аналог InstallSmartUseCase):
 *
 * 1. Excel-шаблон → List[] (в одном файле может быть несколько списков).
 * 2. Для каждого списка: создать/актуализировать инфоблок в Bitrix
 *    (поиск существующего по кандидатам кода — см. BxListInstallService).
 * 3. Upsert строки `bitrixlists` в PortalDB ДО установки полей —
 *    field use-case-ы резолвят список через эту строку.
 * 4. Установка полей (gating по isNeedUpdate) + зеркало в `bitrixfields`.
 *
 * group эндпоинта задаёт папку шаблона; в БД и Bitrix пишется group
 * из самого листа Excel (они могут различаться, например general-папка
 * с group=sales).
 */
@Injectable()
export class InstallListUseCase {
    private readonly logger = new Logger(InstallListUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly parseListService: ParseListService,
        private readonly portalListService: PortalListService,
        private readonly portalListFieldInstallService: PortalListFieldInstallService,
    ) {}

    /** Установить весь эталон: все списки всех существующих шаблонов. */
    async executeAll(domain: string): Promise<InstallListsResponseDto> {
        const templates = await this.parseListService.getAllTemplates();
        if (templates.length === 0) {
            throw new NotFoundException('No list templates found');
        }
        const installed: InstalledListResultDto[] = [];
        for (const source of templates) {
            installed.push(await this.installOne(domain, source.list));
        }
        return { domain, installed };
    }

    async execute(
        domain: string,
        listName: ListFolderEnum,
        group: ListGroupEnum,
    ): Promise<InstallListsResponseDto> {
        const parsedLists = await this.parseListService.getParsedData(
            listName,
            group,
        );
        if (parsedLists.length === 0) {
            throw new NotFoundException(
                `No lists parsed for listName=${listName} group=${group}`,
            );
        }

        const installed: InstalledListResultDto[] = [];
        for (const parsedList of parsedLists) {
            installed.push(await this.installOne(domain, parsedList));
        }
        return { domain, installed };
    }

    private async installOne(
        domain: string,
        parsedList: List,
    ): Promise<InstalledListResultDto> {
        const bxListInstall = new BxListInstallService(domain, this.pbxService);
        const knownBitrixId = await this.findKnownBitrixId(domain, parsedList);
        const ensured = await bxListInstall.ensureList(
            parsedList,
            knownBitrixId,
        );

        const row = await this.portalListService.upsertFromBitrix(domain, {
            type: parsedList.type,
            group: parsedList.group,
            name: parsedList.name,
            title: parsedList.name,
            bitrixId: ensured.bitrixId,
        });

        const listKey = {
            type: parsedList.type,
            group: parsedList.group,
            code: parsedList.code,
        };
        const fields = parsedList.fields.filter(f => f.isNeedUpdate);
        let fieldsResult = emptyFieldsInstallResult(
            listKey,
            'no fields to install',
        );
        if (fields.length > 0) {
            const bxFieldsInstall = new BxListFieldsInstallService(
                domain,
                this.pbxService,
                { IBLOCK_ID: ensured.bitrixId },
                listKey,
                fields,
            );
            const bxResult = await bxFieldsInstall.installFields();
            if (bxResult.countSuccess === 0) {
                throw new Error(
                    `В Bitrix не удалось установить ни одного поля списка ${parsedList.code} (${domain})`,
                );
            }
            const clearFields = bxResult.results.filter(
                r => r.bxField !== undefined,
            ) as IPbxListFieldInstallData[];
            const portalFieldEntityInstallResult =
                await this.portalListFieldInstallService.syncWithDb(
                    bigintConvertToNumber(row.id),
                    listKey,
                    clearFields,
                );
            fieldsResult = toFieldsInstallResultDto(
                listKey,
                bxResult,
                portalFieldEntityInstallResult.length,
            );
        }

        this.logger.log(
            `List ${parsedList.code} installed on ${domain} (bitrixId=${ensured.bitrixId})`,
        );
        return {
            list: listKey,
            name: parsedList.name,
            bitrix: ensured,
            portalListId: bigintConvertToNumber(row.id),
            fields: fieldsResult,
        };
    }

    /** IBLOCK_ID из существующей строки `bitrixlists` (если зеркало уже есть). */
    private async findKnownBitrixId(
        domain: string,
        parsedList: List,
    ): Promise<number | null> {
        try {
            const row = await this.portalListService.findRowByDomainAndKeys(
                domain,
                parsedList.type,
                parsedList.group,
            );
            return bigintConvertToNumber(row.bitrixId);
        } catch {
            return null;
        }
    }
}
