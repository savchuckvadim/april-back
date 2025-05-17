import { Body, Controller, Post } from "@nestjs/common";
import { IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { ListService } from "./list.service";


class GetBxListDto {
    @ApiProperty({ example: 'example.bitrix24.ru' })
    @IsString()
    domain: string;
}
@Controller('bitrix/list')
export class ListController {
    constructor(
        private readonly listService: ListService
    ) {}

    @Post('get')
    async getListFields(@Body() body: GetBxListDto) {
        return this.listService.getListFields();
    }
}
