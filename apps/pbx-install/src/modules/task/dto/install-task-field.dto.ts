import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { InstallEntityFieldsBulkDto } from '../../shared';

/**
 * Тело запроса установки полей задачи по уже подготовленному массиву полей.
 */
export class InstallTaskFieldDto extends InstallEntityFieldsBulkDto {
    @ApiProperty({
        description:
            'Домен Bitrix-портала, на котором выполняется установка полей задачи. ' +
            'Передаётся без протокола и завершающего слэша.',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    @Matches(/^[a-z0-9.-]+\.[a-z]{2,}$/i, {
        message:
            'domain must be a valid hostname without protocol (e.g. example.bitrix24.ru)',
    })
    domain: string;
}
