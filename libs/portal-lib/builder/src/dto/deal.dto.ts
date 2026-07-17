import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { IPDeal } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { CrmEntityBaseDto } from './crm-entity-base.dto';
import { CategoryDto } from './category.dto';

/** Сделка (обобщающая модель), как её отдавал Laravel BtxDealResource. */
export class DealDto extends CrmEntityBaseDto implements IPDeal {
    @ApiProperty({
        description: 'Категории (воронки) сделки',
        type: [CategoryDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CategoryDto)
    categories!: CategoryDto[];
}
