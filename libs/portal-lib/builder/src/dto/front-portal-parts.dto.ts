import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BitrixListDto } from './bitrix-list.dto';
import { CallingGroupDto } from './calling-group.dto';
import { CompanyDto } from './company.dto';
import { ContactDto } from './contact.dto';
import { DealDto } from './deal.dto';
import { DepartamentDto } from './departament.dto';
import { LeadDto } from './lead.dto';
import { RpaDto } from './rpa.dto';
import { SmartDto } from './smart.dto';
import { UserDto } from './user.dto';

/**
 * Части портала по запросу (POST front/portal/parts). В ответе есть только
 * запрошенные части — остальных ключей нет. Форма каждой части та же, что в
 * полной модели (FrontPortalDto), так что из частей собирается тот же объект.
 */
export class FrontPortalPartsDto {
    @ApiProperty({
        description: 'ID портала в нашей БД',
        example: 1,
        type: Number,
    })
    id!: number;

    @ApiPropertyOptional({
        description: 'Сделка — обобщающая модель (первая): поля и воронки',
        type: DealDto,
        nullable: true,
    })
    bitrixDeal?: DealDto | null;

    @ApiPropertyOptional({
        description: 'Компания — обобщающая модель (первая): поля',
        type: CompanyDto,
        nullable: true,
    })
    company?: CompanyDto | null;

    @ApiPropertyOptional({
        description: 'Контакт — обобщающая модель (первый): поля',
        type: ContactDto,
        nullable: true,
    })
    contact?: ContactDto | null;

    @ApiPropertyOptional({
        description: 'Лид — обобщающая модель (первый): поля и стадии',
        type: LeadDto,
        nullable: true,
    })
    lead?: LeadDto | null;

    @ApiPropertyOptional({
        description: 'RPA-процессы портала',
        type: [RpaDto],
    })
    rpas?: RpaDto[];

    @ApiPropertyOptional({
        description:
            'Смарт-процессы портала; с smartTypes в запросе — только этих типов',
        type: [SmartDto],
    })
    smarts?: SmartDto[];

    @ApiPropertyOptional({
        description: 'Универсальные списки Битрикс портала',
        type: [BitrixListDto],
    })
    bitrixLists?: BitrixListDto[];

    @ApiPropertyOptional({
        description: 'Пользовательская модель BtxUser (первая)',
        type: UserDto,
        nullable: true,
    })
    user?: UserDto | null;

    @ApiPropertyOptional({
        description: 'Отдел продаж (первый с group=sales)',
        type: DepartamentDto,
        nullable: true,
    })
    departament?: DepartamentDto | null;

    @ApiPropertyOptional({
        description: 'Группа задач на прозвон (первая с group=sales)',
        type: CallingGroupDto,
        nullable: true,
    })
    bitrixCallingTasksGroup?: CallingGroupDto | null;
}
