import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    ComplectDescriptionGenerateDto,
    ComplectDescriptionResponseDto,
} from '../dto/complect-description.dto';
import { ComplectDescriptionService } from '../services/complect-description.service';

@ApiTags('KonstructorComplectDescription')
@Controller('complect-description')
export class ComplectDescriptionController {
    constructor(private readonly service: ComplectDescriptionService) {}

    @Post('generate')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Описание комплекта (DOCX)',
        description:
            'Тексты блоков наполнения по группам: из БД по коду, чего нет — из запроса. ' +
            'Замена Laravel getDescription (решение владельца 9).',
    })
    @ApiBody({ type: ComplectDescriptionGenerateDto })
    @ApiOkResponse({ type: ComplectDescriptionResponseDto })
    async generate(
        @Body() dto: ComplectDescriptionGenerateDto,
    ): Promise<ComplectDescriptionResponseDto> {
        return this.service.generate(dto);
    }
}
