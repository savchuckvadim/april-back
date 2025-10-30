import { Body, Controller, Get, Post } from "@nestjs/common";
import { OrkHistoryBxListItemDto, OrkHistoryBxListService } from "../service/ork-history-bx-list.service";
import { ApiOperation, ApiProperty, ApiTags } from "@nestjs/swagger";
import { IsString } from "class-validator";


export class OrkListHistoryCheckDto extends OrkHistoryBxListItemDto {

    @ApiProperty({ description: 'Domain' })
    @IsString()
    domain: string;
}
@ApiTags('PBX Ork History Bx List Check')
@Controller('ork-list-history-check')
export class OrkHistoryBxListCheckController {
    constructor(private readonly orkHistoryBxListService: OrkHistoryBxListService) { }

    @ApiOperation({ summary: 'Set item', description: 'Set item to Ork History Bx List' })
   
    @Post('set-item')
    async setItem(@Body() dto: OrkListHistoryCheckDto) {
        return await this.orkHistoryBxListService.setOrkHistoryBxListItem(dto.domain, dto);
    }
}
