import { ApiProperty } from '@nestjs/swagger';

/**
 * Ответ удаления отдела из PortalDB.
 */
export class DeleteDepartamentResponseDto {
    @ApiProperty({
        description: 'Признак успешного удаления строки `departaments`.',
        example: true,
        type: Boolean,
    })
    success!: boolean;
}
