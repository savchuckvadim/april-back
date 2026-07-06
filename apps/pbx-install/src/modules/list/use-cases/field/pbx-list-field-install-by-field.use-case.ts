import { Injectable } from '@nestjs/common';
import { Field } from '@app/pbx-install/shared/parse-field-excel/type/parse-field.type';
import { InstallListFieldDto } from '../../dto/install-list-field.dto';
import { ListFieldsInstallResultDto } from '../../dto/list-response.dto';
import { PbxListFieldInstallByParseUseCase } from './pbx-list-field-install-by-parse.use-case';

/**
 * Body-вариант установки полей списка: массив полей приходит в теле запроса
 * (шаблон не читается). Для повторной установки/синхронизации и интеграций,
 * когда фронт сам формирует payload.
 */
@Injectable()
export class PbxListFieldInstallByFieldUseCase {
    constructor(
        private readonly byParseUseCase: PbxListFieldInstallByParseUseCase,
    ) {}

    async installListFields(
        dto: InstallListFieldDto,
    ): Promise<ListFieldsInstallResultDto> {
        const fields: Field[] = dto.fields ?? [];
        return await this.byParseUseCase.installForList(
            dto.domain,
            {
                type: dto.type,
                group: dto.group,
                code: `${dto.group}_${dto.type}`,
            },
            fields,
        );
    }
}
