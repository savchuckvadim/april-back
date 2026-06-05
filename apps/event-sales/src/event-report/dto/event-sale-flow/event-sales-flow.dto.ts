import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanDto } from './plan.dto';
import { ReportDto } from './report.dto';
import { EventTaskDto } from './task.dto';
import { PlacementDto } from './placement.dto';
import { ContactDto } from './contact.dto';
import { SaleDto } from './sale.dto';
import { DepartamentDto } from './department.dto';
import { FailDto } from './fail.dto';
import { LeadDto } from './lead.dto';
import { PresentationDto } from './presentation.dto';

/** Возврат сущности в ТМЦ. */
export class ReturnToTmcDto {
    @ApiProperty({
        description: 'Флаг запроса на возврат сущности в ТМЦ.',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    data: boolean;

    @ApiProperty({
        description: 'Признак активности ветки возврата в ТМЦ.',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    isActive: boolean;
}

export class EventSalesFlowDto {
    @ApiProperty({
        description:
            'Домен портала Bitrix клиента. По нему `PBXService.init` отдаёт ' +
            'инстанс bitrix и портал с ключами доступа.',
        type: String,
        example: 'client.bitrix24.ru',
    })
    @IsString()
    domain: string;

    @ApiPropertyOptional({
        description: 'План звонка: тип, ответственный, дедлайн, контакт.',
        type: PlanDto,
    })
    @IsOptional()
    @IsObject()
    @ValidateNested()
    @Type(() => PlanDto)
    plan: PlanDto;

    @ApiPropertyOptional({
        description: 'Отчёт по событию: статус результата, причины, контакт.',
        type: ReportDto,
    })
    @IsOptional()
    @IsObject()
    @ValidateNested()
    @Type(() => ReportDto)
    report: ReportDto;

    @ApiPropertyOptional({
        description: 'Текущая задача, по которой отчитывается менеджер.',
        type: EventTaskDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => EventTaskDto)
    currentTask?: EventTaskDto;

    @ApiPropertyOptional({
        description:
            'Контекст встройки Bitrix (placement), из которой пришло событие.',
        type: PlacementDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => PlacementDto)
    placement?: PlacementDto;

    @ApiPropertyOptional({
        description: 'Контакт события. `null`, если контакт не выбран.',
        type: ContactDto,
        nullable: true,
    })
    @IsOptional()
    @Type(() => ContactDto)
    contact?: ContactDto | null;

    @ApiPropertyOptional({
        description:
            'Данные продажи (связка презентация ↔ сделка). `null`, если нет.',
        type: SaleDto,
        nullable: true,
    })
    @IsOptional()
    @Type(() => SaleDto)
    sale?: SaleDto | null;

    @ApiPropertyOptional({
        description: 'Подразделение/режим, в котором выполняется flow.',
        type: DepartamentDto,
    })
    @IsOptional()
    @Type(() => DepartamentDto)
    departament?: DepartamentDto;

    @ApiPropertyOptional({
        description: 'Параметры пост-фейл обработки (дата повторного касания).',
        type: FailDto,
    })
    @IsOptional()
    @Type(() => FailDto)
    fail?: FailDto;

    @ApiPropertyOptional({
        description: 'Признак пост-продажного сценария.',
        type: Boolean,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    isPostSale?: boolean;

    @ApiPropertyOptional({
        description: 'Параметры возврата сущности в ТМЦ.',
        type: ReturnToTmcDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ReturnToTmcDto)
    returnToTmc?: ReturnToTmcDto;

    @ApiPropertyOptional({
        description: 'Лид, связанный с событием.',
        type: LeadDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => LeadDto)
    lead?: LeadDto;

    @ApiProperty({
        description: 'Данные презентации: счётчики и флаги проведения.',
        type: PresentationDto,
    })
    @ValidateNested()
    @Type(() => PresentationDto)
    presentation: PresentationDto;
}
