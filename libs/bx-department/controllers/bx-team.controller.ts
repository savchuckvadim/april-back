import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { BxTeamService } from '../services/bx-team.service';
import { BxTeamRequestDto, BxTeamResponseDto } from '../dto/bx-team.dto';

@ApiTags('Bitrix Domain Team')
@Controller('bx/team')
export class BxTeamController {
    constructor(private readonly service: BxTeamService) {}

    @ApiOperation({
        summary:
            'Получить команду портала по группе: sales — ЦУП, service — Отдел сервиса',
        description:
            'Возвращает дерево команды из структуры компании Битрикс24 (REST 3.0): корневую команду с участниками и подкоманды (например, отделы продаж по территориям)',
    })
    @ApiBody({
        type: BxTeamRequestDto,
        description:
            'Домен портала, группа команды и флаг сброса кэша resetCache.',
    })
    @ApiOkResponse({
        description: 'Дерево команды с участниками',
        type: BxTeamResponseDto,
    })
    @ApiNotFoundResponse({
        description: 'Команда группы не найдена на портале',
    })
    @Post('')
    @HttpCode(200)
    async getTeam(@Body() dto: BxTeamRequestDto): Promise<BxTeamResponseDto> {
        return await this.service.getTeam(
            dto.domain,
            dto.group,
            dto.resetCache,
        );
    }
}
