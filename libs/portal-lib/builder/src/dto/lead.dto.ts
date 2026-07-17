import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { ILead } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { CrmEntityBaseDto } from './crm-entity-base.dto';
import { CategoryDto } from './category.dto';

/** Лид, как его отдавал Laravel BtxLeadResource. */
export class LeadDto extends CrmEntityBaseDto implements ILead {
    @ApiProperty({
        description: 'Категории (воронки) лида',
        type: [CategoryDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CategoryDto)
    categories!: CategoryDto[];
}
