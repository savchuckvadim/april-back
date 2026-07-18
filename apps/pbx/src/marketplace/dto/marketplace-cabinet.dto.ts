import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PortalSessionState } from '../services/marketplace-session.service';
import { MarketplaceProduct } from '../config/marketplace-manifest';

/**
 * DTO сводки кабинета «Менеджер Гарант» (экран active): продукты портала
 * и статусы компонентов установки. Отдаётся ТОЛЬКО под portal-context
 * сессией (PortalSessionGuard) — контекст из проверенного токена.
 */

export class CabinetOrganizationDto {
    @ApiProperty({
        description:
            'Название организации клиента, указанное в заявке онбординга (clients.name).',
        type: String,
        example: 'ООО «Ромашка»',
    })
    name!: string;

    @ApiPropertyOptional({
        description:
            'Контактный email организации из заявки онбординга (clients.email).',
        type: String,
        example: 'director@romashka.ru',
    })
    email?: string;
}

export class CabinetProductDto {
    @ApiProperty({
        description: 'Код продукта',
        enum: MarketplaceProduct,
        example: MarketplaceProduct.SALES,
    })
    code!: MarketplaceProduct | string;

    @ApiProperty({
        description:
            'Статус продукта на портале (active | inactive | suspended); отсутствие записи = продукт не подключён',
        type: String,
        example: 'active',
    })
    status!: string;

    @ApiPropertyOptional({
        description: 'Когда продукт активирован',
        type: String,
        example: '2026-07-18T10:00:00.000Z',
    })
    activatedAt?: string;
}

export class CabinetComponentDto {
    @ApiProperty({
        description: 'Код продукта, которому принадлежит компонент',
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
            'Код компонента (пустая строка — агрегат всей оси pbx_entities)',
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
            'Код причины (awaiting_approval | tariff_restricted | bitrix_archive | partial_failure …)',
        type: String,
        example: 'tariff_restricted',
    })
    reasonCode?: string;
}

export class CabinetSummaryDto {
    @ApiProperty({
        description: 'Состояние допуска портала',
        enum: PortalSessionState,
        example: PortalSessionState.ACTIVE,
    })
    state!: PortalSessionState;

    @ApiPropertyOptional({
        description: 'Организация клиента (после заявки/одобрения)',
        type: CabinetOrganizationDto,
    })
    organization?: CabinetOrganizationDto;

    @ApiProperty({
        description:
            'Продукты портала из portal_products (продукты без записи — не подключены)',
        type: CabinetProductDto,
        isArray: true,
    })
    products!: CabinetProductDto[];

    @ApiProperty({
        description:
            'Статусы компонентов установки (для секции «Статус установки»)',
        type: CabinetComponentDto,
        isArray: true,
    })
    components!: CabinetComponentDto[];

    @ApiPropertyOptional({
        description: 'Общий статус установки приложения (install_status)',
        type: String,
        example: 'installed',
    })
    installStatus?: string;
}
