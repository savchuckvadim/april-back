import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { DepartamentDto } from './departament.dto';
import { BitrixListDto } from './bitrix-list.dto';
import { CallingGroupDto } from './calling-group.dto';
import { SmartDto } from './smart.dto';
import { DealDto } from './deal.dto';
import { RpaDto } from './rpa.dto';
import { UserDto } from './user.dto';
import { CompanyDto } from './company.dto';
import { LeadDto } from './lead.dto';
import { ContactDto } from './contact.dto';

/**
 * Модель портала для фронта — поле в поле повторяет ответ Laravel
 * PortalFrontResource (эндпоинт POST front/portal). Ключей доступа не содержит.
 */
export class FrontPortalDto {
    @ApiProperty({
        description: 'ID портала в нашей БД',
        example: 1,
        type: Number,
    })
    @IsNumber()
    id!: number;

    @ApiProperty({
        description: 'Отдел продаж (первый с group=sales)',
        type: DepartamentDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => DepartamentDto)
    departament!: DepartamentDto | null;

    @ApiProperty({
        description: 'Универсальные списки Битрикс портала',
        type: [BitrixListDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BitrixListDto)
    bitrixLists!: BitrixListDto[];

    @ApiProperty({
        description: 'Группа задач на прозвон (первая с group=sales)',
        type: CallingGroupDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => CallingGroupDto)
    bitrixCallingTasksGroup!: CallingGroupDto | null;

    @ApiProperty({
        description: 'Смарт-процесс продаж (первый с group=sales)',
        type: SmartDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => SmartDto)
    bitrixSmart!: SmartDto | null;

    @ApiProperty({
        description: 'Сделка — обобщающая модель (первая)',
        type: DealDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => DealDto)
    bitrixDeal!: DealDto | null;

    @ApiProperty({
        description: 'Все смарт-процессы портала',
        type: [SmartDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SmartDto)
    smarts!: SmartDto[];

    @ApiProperty({
        description: 'Все сделки (обобщающие модели) портала',
        type: [DealDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DealDto)
    deals!: DealDto[];

    @ApiProperty({ description: 'RPA-процессы портала', type: [RpaDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RpaDto)
    rpas!: RpaDto[];

    @ApiProperty({
        description: 'Пользовательская модель BtxUser (первая)',
        type: UserDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => UserDto)
    user!: UserDto | null;

    @ApiProperty({
        description: 'Компания — обобщающая модель (первая)',
        type: CompanyDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => CompanyDto)
    company!: CompanyDto | null;

    @ApiProperty({
        description: 'Лид — обобщающая модель (первый)',
        type: LeadDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => LeadDto)
    lead!: LeadDto | null;

    @ApiProperty({
        description: 'Контакт — обобщающая модель (первый)',
        type: ContactDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ContactDto)
    contact!: ContactDto | null;
}
