import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * DTO погашения кода подключения портала к внешнему сервису April
 * и клиентского запуска установки продукта.
 *
 * Контекст портала (member_id) НЕ принимается от клиента — берётся из
 * проверенного portal-context токена (PortalSessionGuard).
 */

export class RedeemInviteDto {
    @ApiProperty({
        description:
            'Код подключения из письма (регистр и дефисы не важны: GRNT-AB12-CD34, grnt ab12 cd34)',
        type: String,
        example: 'GRNT-AB12-CD34',
    })
    @IsString()
    @IsNotEmpty()
    @MinLength(8)
    @MaxLength(32)
    code!: string;
}

export class RedeemInviteResultDto {
    @ApiProperty({
        description:
            'Состояние допуска портала после погашения (ожидается active)',
        type: String,
        example: 'active',
    })
    state!: string;

    @ApiProperty({
        description: 'Код подключённого продукта',
        type: String,
        example: 'sales',
    })
    productCode!: string;

    @ApiProperty({
        description:
            'Запущена ли установка сущностей на портале. false — установку запускает сам клиент кнопкой (сценарий с мастером настройки)',
        type: Boolean,
        example: true,
    })
    provisionStarted!: boolean;

    @ApiPropertyOptional({
        description: 'Организация, к которой подключён портал',
        type: String,
        example: 'ООО «Ромашка»',
    })
    organizationName?: string;
}

export class InstallProductResultDto {
    @ApiProperty({
        description: 'Код продукта, установка которого запущена',
        type: String,
        example: 'sales',
    })
    productCode!: string;

    @ApiProperty({
        description: 'Задача установки поставлена в очередь',
        type: Boolean,
        example: true,
    })
    provisionStarted!: boolean;
}
