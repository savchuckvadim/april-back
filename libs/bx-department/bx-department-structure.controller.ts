import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { BxDepartmentStructureService } from './services/bx-department-structure.service';
import {
    BxDepartmentStructureRequestDto,
    BxDepartmentStructureResponseDto,
} from './dto/bx-department-structure.dto';

@ApiTags('Bitrix Domain Department')
@Controller('bx/department/structure')
export class BxDepartmentStructureController {
    constructor(private readonly service: BxDepartmentStructureService) {}

    @ApiOperation({
        summary:
            'Структура отделов продаж (старый API) с мультирежимом, ролью пользователя и коллегами',
        description:
            'При isMultiple=true ищет по всей структуре портала все отделы группы (названия «ОП …» или «Отдел продаж»), возвращает их в прежнем формате (смерджены в одну структуру) и рядом — разбивку по каждому ОП с группами. Также определяет, руководитель ли текущий пользователь (cup/op/group) и возвращает его коллег по группе и по отделу.',
    })
    @ApiBody({
        type: BxDepartmentStructureRequestDto,
        description: 'Домен, группа отделов, мультирежим и id пользователя.',
    })
    @ApiOkResponse({
        description:
            'Смердженная структура, разбивка по отделам продаж и данные текущего пользователя',
        type: BxDepartmentStructureResponseDto,
    })
    @ApiNotFoundResponse({
        description: 'Отделы группы не найдены на портале',
    })
    @Post('')
    @HttpCode(200)
    async getStructure(
        @Body() dto: BxDepartmentStructureRequestDto,
    ): Promise<BxDepartmentStructureResponseDto> {
        return await this.service.getStructure(
            dto.domain,
            dto.department,
            dto.isMultiple ?? false,
            dto.userId,
        );
    }
}
