import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { bigintConvertToNumber } from '@/shared';
import { Field } from '@app/pbx-install/shared/parse-field-excel/type/parse-field.type';
import { ParseListService } from '../../services/parse/parse-list.service';
import { ListContextResolver } from '../../services/list-context.resolver';
import { BxListFieldsInstallService } from '../../services/install/bx-list-fields-install.service';
import {
    IPbxListFieldInstallData,
    PortalListFieldInstallService,
} from '../../services/install/portal-list-field-install.service';
import { List, ListFolderEnum, ListGroupEnum } from '../../type/parse.type';
import { ListFieldsInstallResultDto } from '../../dto/list-response.dto';
import {
    emptyFieldsInstallResult,
    toFieldsInstallResultDto,
} from '../../lib/list-response.mapper';

/**
 * Установка полей списков из Excel-шаблона (зеркало PbxSmartFieldInstallByParseUseCase).
 *
 * Предполагает, что строка списка в `bitrixlists` уже существует — её создаёт
 * оркестратор InstallListUseCase через PortalListService.upsertFromBitrix
 * ДО вызова этого use-case-а. В одном шаблоне может быть несколько списков —
 * поля ставятся каждому.
 */
@Injectable()
export class PbxListFieldInstallByParseUseCase {
    private readonly logger = new Logger(
        PbxListFieldInstallByParseUseCase.name,
    );

    constructor(
        private readonly pbxService: PBXService,
        private readonly parseListService: ParseListService,
        private readonly resolver: ListContextResolver,
        private readonly portalSync: PortalListFieldInstallService,
    ) {}

    async installListFields(
        domain: string,
        listName: ListFolderEnum,
        group: ListGroupEnum,
    ): Promise<ListFieldsInstallResultDto[]> {
        const parsedLists = await this.parseListService.getParsedData(
            listName,
            group,
        );
        if (parsedLists.length === 0) {
            throw new NotFoundException(
                `No lists parsed for listName=${listName} group=${group}`,
            );
        }

        const results: ListFieldsInstallResultDto[] = [];
        for (const list of parsedLists) {
            const fields = (list.fields ?? []).filter(f => f.isNeedUpdate);
            results.push(await this.installForList(domain, list, fields));
        }
        return results;
    }

    async installForList(
        domain: string,
        list: Pick<List, 'type' | 'group' | 'code'>,
        fields: Field[],
    ): Promise<ListFieldsInstallResultDto> {
        const listInfo = {
            type: list.type,
            group: list.group,
            code: list.code,
        };
        if (fields.length === 0) {
            return emptyFieldsInstallResult(listInfo, 'no fields to install');
        }

        const ctx = await this.resolver.resolve({
            domain,
            type: list.type,
            group: list.group,
        });

        const bxFieldService = new BxListFieldsInstallService(
            domain,
            this.pbxService,
            { IBLOCK_ID: ctx.listBitrixId },
            listInfo,
            fields,
        );
        const bxResult = await bxFieldService.installFields();
        if (bxResult.countSuccess === 0) {
            throw new Error(
                `В Bitrix не удалось изменить ни одного поля списка ${list.code}`,
            );
        }

        const clearFields = bxResult.results.filter(
            r => r.bxField !== undefined,
        ) as IPbxListFieldInstallData[];
        const portalFieldEntityInstallResult = await this.portalSync.syncWithDb(
            bigintConvertToNumber(ctx.listDbId),
            listInfo,
            clearFields,
            domain,
        );

        return toFieldsInstallResultDto(
            listInfo,
            bxResult,
            portalFieldEntityInstallResult.length,
        );
    }
}
