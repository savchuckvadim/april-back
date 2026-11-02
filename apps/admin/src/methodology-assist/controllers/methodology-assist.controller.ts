import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    Post,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiBody,
    ApiConsumes,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { Role, Roles } from '@lib/auth';
import {
    METHODOLOGY_ADMIN_PATH,
    METHODOLOGY_ADMIN_TAG,
} from '@lib/call-lib/call-report/methodology';
import {
    MethodologyAssistBodyDto,
    MethodologyAssistResultDto,
} from '../dto/methodology-assist.dto';
import { MethodologyAssistService } from '../services/methodology-assist.service';

/** Путь помощника внутри раздела методик. */
export const METHODOLOGY_ASSIST_ROUTE = 'assist';

/**
 * Помощник брифа методики: документ (docx/pdf/txt или текст) → черновик
 * конфига по нашему каталогу пунктов, фактов и ограничителей. Живёт в
 * apps/admin: нужен шлюз моделей (@lib/llm-gateway) и загрузчик текста
 * (@lib/ai-rag), которые call-lib не импортирует. Вызов платный — только
 * суперпользователь; черновик человек правит в форме, автопринятия нет.
 */
@ApiTags(METHODOLOGY_ADMIN_TAG)
@ApiBearerAuth()
@Roles(Role.SUPER_USER)
@Controller(METHODOLOGY_ADMIN_PATH)
export class MethodologyAssistController {
    constructor(private readonly service: MethodologyAssistService) {}

    @Post(METHODOLOGY_ASSIST_ROUTE)
    @HttpCode(HttpStatus.OK)
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({
        summary: 'Собрать черновик методики из документа',
        description:
            'Текст документа (файл docx/pdf/txt/md и/или вставленный текст) ' +
            'уходит модели через шлюз разборов со строгой схемой конфига; ' +
            'ответ проходит валидатор. Возвращает черновик для формы либо ' +
            'ошибки валидатора; ничего не сохраняет.',
    })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                    description: 'Документ методики: docx, pdf, txt или md.',
                },
                text: {
                    type: 'string',
                    description: 'Вставленный текст документа.',
                },
                domain: {
                    type: 'string',
                    description: 'Домен портала для ключей модели.',
                },
                code: { type: 'string', description: 'Желаемый код методики.' },
                title: {
                    type: 'string',
                    description: 'Желаемое название методики.',
                },
            },
        },
    })
    @ApiOkResponse({
        description: 'Черновик конфига либо ошибки валидатора.',
        type: MethodologyAssistResultDto,
    })
    @ApiBadRequestResponse({
        description:
            'Нет ни файла, ни текста, либо неподдерживаемый тип файла.',
    })
    async assist(
        @Body() body: MethodologyAssistBodyDto,
        @UploadedFile() file?: Express.Multer.File,
    ): Promise<MethodologyAssistResultDto> {
        const result = await this.service.assist({
            text: body.text?.trim() || null,
            file: file
                ? { buffer: file.buffer, originalName: file.originalname }
                : null,
            domain: body.domain?.trim() || null,
            code: body.code?.trim() || null,
            title: body.title?.trim() || null,
        });
        return result;
    }
}
