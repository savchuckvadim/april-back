import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    APP_PART_CODES,
    APP_WIDGET_CODES,
    AppPartCode,
    AppWidgetCode,
} from '@lib/portal-lib/store/app-settings';
import {
    CABINET_ACCESS_LEVELS,
    CABINET_ROLES,
    CabinetAccessLevel,
    CabinetRole,
} from '../domain/cabinet.constants';
import {
    CabinetPortalOverview,
    CabinetPortalSummary,
    CabinetProfile,
} from '../portals/cabinet-portal.service';

export class CabinetPortalSummaryDto implements CabinetPortalSummary {
    @ApiProperty({
        description: 'ID портала в April (portals.id).',
        type: Number,
        example: 12,
    })
    portalId!: number;

    @ApiPropertyOptional({
        description: 'Домен портала Битрикс24.',
        type: String,
        example: 'company.bitrix24.ru',
        nullable: true,
    })
    domain!: string | null;

    @ApiPropertyOptional({
        description: 'Организация-клиент, к которой привязан портал.',
        type: String,
        example: 'ООО «Гарант-Сервис»',
        nullable: true,
    })
    organization!: string | null;

    @ApiPropertyOptional({
        description:
            'Допуск портала вендором: approved — подключён, pending — ждёт подключения, blocked — отключён; пусто — действующий портал April (подключён).',
        type: String,
        example: 'approved',
        nullable: true,
    })
    approvalStatus!: string | null;

    @ApiPropertyOptional({
        description:
            'Роль в кабинете портала: owner — владелец, member — участник, pending — заявка ждёт подтверждения; пусто — доступа нет (только фрейм).',
        type: String,
        enum: CABINET_ROLES,
        example: 'owner',
        nullable: true,
    })
    role!: CabinetRole | null;
}

export class CabinetPortalOverviewDto
    extends CabinetPortalSummaryDto
    implements CabinetPortalOverview
{
    @ApiProperty({
        description:
            'Уровень доступа к порталу: frame — сотрудник из Битрикса без доступа к кабинету, member, owner, platform — администратор April.',
        type: String,
        enum: CABINET_ACCESS_LEVELS,
        example: 'owner',
    })
    level!: CabinetAccessLevel;

    @ApiProperty({
        description:
            'Части приложения, подключённые порталу по договору: sales — отдел продаж, service — отдел сервиса.',
        type: String,
        isArray: true,
        enum: APP_PART_CODES,
        example: ['sales'],
    })
    enabledParts!: AppPartCode[];

    @ApiProperty({
        description: 'Виджеты приложения, которые должны стоять на портале.',
        type: String,
        isArray: true,
        enum: APP_WIDGET_CODES,
        example: ['event-sales', 'report-sales'],
    })
    widgets!: AppWidgetCode[];
}

export class CabinetProfileDto implements CabinetProfile {
    @ApiProperty({
        description: 'ID учётной записи кабинета.',
        type: Number,
        example: 17,
    })
    userId!: number;

    @ApiPropertyOptional({
        description: 'Email учётной записи.',
        type: String,
        example: 'director@company.ru',
        nullable: true,
    })
    email!: string | null;

    @ApiProperty({ description: 'Имя.', type: String, example: 'Иван' })
    firstName!: string;

    @ApiProperty({ description: 'Фамилия.', type: String, example: 'Петров' })
    lastName!: string;

    @ApiProperty({
        description: 'Пароль задан — учётка может входить с сайта.',
        type: Boolean,
        example: true,
    })
    hasPassword!: boolean;

    @ApiProperty({
        description: 'Порталы, к которым у учётки есть доступ.',
        type: [CabinetPortalSummaryDto],
    })
    portals!: CabinetPortalSummaryDto[];
}
