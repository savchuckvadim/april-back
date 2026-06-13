import { ApiProperty } from '@nestjs/swagger';
import { PbxFieldEntityDto } from '@lib/portal-lib/pbx-domain/field/dto/pbx-field.enity.dto';

/** Ответ со списком PBX-полей пользователя из PortalDB (без обращения к Bitrix). */
export class PbxUserFieldsListResponseDto {
    @ApiProperty({
        description:
            'Поля пользователя (сущность BtxUser) портала, как они хранятся ' +
            'в PortalDB. Живой Bitrix здесь не запрашивается.',
        type: [PbxFieldEntityDto],
    })
    fields!: PbxFieldEntityDto[];
}
