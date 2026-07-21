import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO модерации маркетплейс-подключений (заявки онбординга):
 * список заявок, approve/block портала, статусы компонентов установки.
 */

/**
 * Действие модератора над заявкой портала.
 *
 * detach («отвязать портал») нужен потому, что подключение живёт на уровне
 * портала и ПЕРЕЖИВАЕТ переустановку приложения (решение владельца
 * 2026-07-20): единственный способ вернуть портал на экран ввода кода —
 * ручная отвязка (смена владельца портала, отзыв доступа без блокировки).
 */
export enum ApprovalAction {
    APPROVE = 'approve',
    BLOCK = 'block',
    DETACH = 'detach',
}

export class ApplicationsQueryDto {
    @ApiPropertyOptional({
        description:
            'Фильтр по статусу допуска портала (pending | approved | blocked)',
        type: String,
        example: 'pending',
    })
    @IsOptional()
    @IsString()
    @MaxLength(32)
    approvalStatus?: string;
}

export class ApplicationDto {
    @ApiProperty({
        description: 'ID портала (portals.id)',
        type: String,
        example: '7',
    })
    portalId!: string;

    @ApiPropertyOptional({
        description: 'Домен портала Битрикс24',
        type: String,
        example: 'april-dev.bitrix24.ru',
    })
    domain?: string;

    @ApiPropertyOptional({
        description: 'member_id портала (постоянный идентификатор)',
        type: String,
        example: '30aedf93f9c0e53a21143710eba8d95f',
    })
    memberId?: string;

    @ApiPropertyOptional({
        description: 'Статус допуска портала (pending | approved | blocked)',
        type: String,
        example: 'pending',
    })
    approvalStatus?: string;

    @ApiPropertyOptional({
        description: 'Название организации из заявки (clients.name)',
        type: String,
        example: 'ООО «Ромашка»',
    })
    organizationName?: string;

    @ApiPropertyOptional({
        description: 'Контактный email из заявки (clients.email)',
        type: String,
        example: 'director@romashka.ru',
    })
    contactEmail?: string;

    @ApiPropertyOptional({
        description: 'Статус клиента (pending | active | disabled)',
        type: String,
        example: 'pending',
    })
    clientStatus?: string;

    @ApiPropertyOptional({
        description: 'Статус установки приложения (install_status)',
        type: String,
        example: 'installed',
    })
    installStatus?: string;

    @ApiPropertyOptional({
        description: 'Приложение удалено с портала (дата ONAPPUNINSTALL)',
        type: String,
        example: '2026-07-18T05:59:35.000Z',
    })
    uninstalledAt?: string;

    @ApiPropertyOptional({
        description:
            'Срок жизни access_token установки (диагностика «спящих» порталов)',
        type: String,
        example: '2026-07-18T06:54:08.000Z',
    })
    tokenExpiresAt?: string;

    @ApiProperty({
        description: 'Есть ли refresh_token (возможен фоновый рефреш)',
        type: Boolean,
        example: true,
    })
    hasRefreshToken!: boolean;

    @ApiPropertyOptional({
        description: 'Когда одобрено (portals.approved_at)',
        type: String,
        example: '2026-07-18T10:00:00.000Z',
    })
    approvedAt?: string;

    @ApiPropertyOptional({
        description: 'Кем одобрено (portals.approved_by)',
        type: String,
        example: 'admin',
    })
    approvedBy?: string;
}

export class ApprovalActionDto {
    @ApiProperty({
        description:
            'Действие: approve — одобрить (активирует продукт sales и запускает установку сущностей), block — заблокировать, detach — отвязать портал (допуск → pending, организация отвязывается, портал возвращается на экран ввода кода подключения)',
        enum: ApprovalAction,
        example: ApprovalAction.APPROVE,
    })
    @IsEnum(ApprovalAction)
    action!: ApprovalAction;

    @ApiPropertyOptional({
        description: 'Комментарий модератора (пишется в журнал событий)',
        type: String,
        example: 'Договор №42 подписан',
    })
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    comment?: string;
}

export class ApprovalResultDto {
    @ApiProperty({
        description: 'ID портала',
        type: String,
        example: '7',
    })
    portalId!: string;

    @ApiProperty({
        description: 'Выполненное действие',
        enum: ApprovalAction,
        example: ApprovalAction.APPROVE,
    })
    action!: ApprovalAction;

    @ApiProperty({
        description: 'Статус допуска портала после операции',
        type: String,
        example: 'approved',
    })
    approvalStatus!: string;

    @ApiPropertyOptional({
        description: 'Статус клиента после операции',
        type: String,
        example: 'active',
    })
    clientStatus?: string;

    @ApiProperty({
        description:
            'Запущен ли provisioning pbx-сущностей (через pbx-ручку активации)',
        type: Boolean,
        example: true,
    })
    provisionDispatched!: boolean;

    @ApiPropertyOptional({
        description: 'Детали ответа pbx (jobId задачи provisioning и т.п.)',
        type: String,
        example: 'mp-provision:30aedf93f9c0e53a21143710eba8d95f:sales',
    })
    provisionJobId?: string;
}

export class InstallComponentDto {
    @ApiProperty({
        description: 'Код продукта (sales | service)',
        type: String,
        example: 'sales',
    })
    productCode!: string;

    @ApiProperty({
        description:
            'Ось компонента (placement | smart_scenario | pbx_entities)',
        type: String,
        example: 'pbx_entities',
    })
    componentType!: string;

    @ApiProperty({
        description:
            'Код компонента (пустая строка — агрегат оси pbx_entities)',
        type: String,
        example: 'smart:cold',
    })
    componentCode!: string;

    @ApiProperty({
        description:
            'Статус (pending | installing | installed | error | unavailable | skipped)',
        type: String,
        example: 'installed',
    })
    status!: string;

    @ApiPropertyOptional({
        description:
            'Код причины (awaiting_approval, tariff_restricted и т.п.)',
        type: String,
        example: 'tariff_restricted',
    })
    reasonCode?: string;

    @ApiPropertyOptional({
        description: 'Детали ошибки установки компонента',
        type: String,
        example: 'crm.type.add: ERROR_CORE',
    })
    errorDetail?: string;

    @ApiProperty({
        description: 'Количество попыток установки',
        type: Number,
        example: 1,
    })
    attempts!: number;
}
