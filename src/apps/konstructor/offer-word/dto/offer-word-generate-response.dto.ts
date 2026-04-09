import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { RegionDto } from '../../document-generate';
import { RqEntity } from '@/modules/portal-konstructor/provider';
import { WordTemplate } from '@/modules/offer-template/word';
import { IInfblockGroupsRenderData } from '../../document-generate/infoblocks/infoblock-render-data.service';

export class InfoblockDto {
    @ApiProperty({ description: 'Name of the infoblock' })
    @IsString()
    name: string;
    @ApiProperty({ description: 'Small description of the infoblock' })
    @IsString()
    smallDescription: string;

    @ApiProperty({ description: 'Medium description of the infoblock' })
    @IsString()
    mediumDescription: string;
    @ApiProperty({ description: 'Big description of the infoblock' })
    @IsString()
    bigDescription: string;
}
export class InfoblockGroupDto implements IInfblockGroupsRenderData {
    @ApiProperty({ description: 'Group name of the infoblock' })
    @IsString()
    groupsName: string;
    @ApiProperty({ description: 'Infoblocks' })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => InfoblockDto)
    infoblocks: InfoblockDto[];
}
export class OfferWordByTemplateGenerateResponseDto {
    @ApiProperty({
        description:
            'Публичная ссылка: на DOCX, если isPdf не true; на PDF, если isPdf=true',
    })
    @IsString()
    link: string;

    @ApiProperty({ description: 'InfoblockGroups' })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => InfoblockGroupDto)
    infoblocks: InfoblockGroupDto[];

    @ApiProperty({ description: 'Regions' })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RegionDto)
    regions: RegionDto[];

    @ApiProperty({ description: 'Template' })
    @ValidateNested()
    @Type(() => WordTemplate)
    template: WordTemplate;

    @ApiProperty({ description: 'Provider' })
    @ValidateNested()
    @Type(() => RqEntity)
    provider: RqEntity | null;
}
