import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** Тело запроса на переименование элемента enumeration-поля только в PortalDB. */
export class PbxUserFieldItemEditDto {
    @ApiProperty({
        description:
            'Новое отображаемое значение элемента списка (name/title в PortalDB). ' +
            'Изменение применяется только к PortalDB и не затрагивает Bitrix.',
        example: 'Десктоп',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    newValue: string;
}
