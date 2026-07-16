import { ApiProperty } from '@nestjs/swagger';
import { PortalDepartamentResponseDto } from '@lib/portal-lib/pbx-domain/portal-departament';

/**
 * Ответ установки отдела на портал.
 */
export class InstallDepartamentResponseDto {
    @ApiProperty({
        description:
            'Результат синхронизации с PortalDB: строка `departaments`, ' +
            'созданная или обновлённая upsert-ом по ключу type + group + portalId.',
        type: PortalDepartamentResponseDto,
    })
    portalResult!: PortalDepartamentResponseDto;
}
