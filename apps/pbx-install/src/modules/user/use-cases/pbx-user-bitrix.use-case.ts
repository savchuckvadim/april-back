import { Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { IBXField } from '@/modules/bitrix';
import {
    BxUserFieldManageService,
    BxUserFieldsInstallService,
    USER_FIELD_PREFIX,
} from '../../shared';
import { PbxUserParseService } from '../services/pbx-user-parse.service';
import {
    BxUserFieldsDeleteResponseDto,
    BxUserFieldsInstallResponseDto,
    BxUserFieldsListResponseDto,
} from '../dto/pbx-user-bitrix.dto';

/**
 * Операции над пользовательскими полями (UF_USR_*) **только в живом Bitrix**,
 * без записи в PortalDB. Источник шаблона полей — константы (USER_FIELDS).
 *
 * `@Injectable`, но Bitrix-инстанс не хранится в `this` (правило CLAUDE.md про
 * race condition): сущность-специфичные сервисы создаются через `new` с
 * `PBXService`, а для чтения живых полей инстанс берётся локально.
 */
@Injectable()
export class PbxUserBitrixUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly parseService: PbxUserParseService,
    ) {}

    /** Живые пользовательские поля Bitrix (только UF_USR_*). */
    async listFields(domain: string): Promise<BxUserFieldsListResponseDto> {
        const { bitrix } = await this.pbxService.init(domain);
        const { result } = await bitrix.user.listFields();
        const fields = ((result ?? []) as unknown as IBXField[]).filter(f =>
            f.FIELD_NAME?.startsWith(USER_FIELD_PREFIX),
        );
        return { domain, fields };
    }

    /** Устанавливает/обновляет поля из шаблона только в Bitrix. */
    async installFields(
        domain: string,
    ): Promise<BxUserFieldsInstallResponseDto> {
        const fields = this.parseService.getFieldsForInstall();
        const service = new BxUserFieldsInstallService(
            domain,
            this.pbxService,
            fields,
        );
        const bxResult = await service.installBxFields();
        return {
            domain,
            countTotal: bxResult.countTotal,
            countSuccess: bxResult.countSuccess,
            countFailed: bxResult.countFailed,
            errorCodes: bxResult.errorCodes,
            results: bxResult.results.map(r => ({
                code: r.code,
                bxFieldName: r.bxField?.FIELD_NAME ?? r.parsedField.bxFieldName,
                result: r.result,
            })),
        };
    }

    /** Удаляет поля по списку code только в Bitrix (имя UF_USR_* берётся из шаблона). */
    async deleteFields(
        domain: string,
        codes: string[],
    ): Promise<BxUserFieldsDeleteResponseDto> {
        const bxFieldNames = codes.map(code => ({
            code,
            bxFieldName:
                this.parseService.findByCode(code)?.bxFieldName ?? code,
        }));
        const service = new BxUserFieldManageService(domain, this.pbxService);
        const results = await service.deleteFields(bxFieldNames);
        return { domain, results };
    }
}
