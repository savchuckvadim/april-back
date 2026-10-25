import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DocumentSupplyInitFormDto } from '../dto/document-supply-init-form.dto';
import { DocumentSupplyReportGenerateDto } from '../dto/document-supply-report-generate.dto';
import {
    DocumentSupplyInitFormResponseDto,
    DocumentSupplyReportGenerateResponseDto,
} from '../dto/document-supply-report-response.dto';
import { InitFormService } from '../services/init-form.service';
import {
    SupplyReportFormRequestDto,
    SupplyReportFormResponseDto,
} from '../dto/supply-report-form.dto';
import { SupplyReportDto } from '../../supply/init-supply/dto/supply-fields/supply-fields.dto';
import { GenerateUseCase } from '../use-cases/generate.use-case';

/**
 * Отчёт о поставке — замена Laravel-ручек `konstruct/supply/init` и
 * `konstruct/supply`.
 *
 * Ответы намеренно отдаются как `{init}` / `{result}`: легаси-конструктор
 * читает `response.data.data[model]`, а внешнюю обёртку `{resultCode, data}`
 * дописывает ResponseInterceptor.
 */
@ApiTags('KonstructorDocumentSupplyReport')
@Controller('document-supply-report')
export class DocumentSupplyReportController {
    constructor(
        private readonly initFormService: InitFormService,
        private readonly generateUseCase: GenerateUseCase,
    ) {}

    @Post('init-form')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Данные формы конструктора для отчёта о поставке',
        description:
            'Провайдеры, реквизиты клиента, общая форма договора, спецификация, тип клиента и — при isSupplyReport — 15 полей формы отчёта о поставке. Аналог POST konstruct/supply/init в Laravel.',
    })
    @ApiBody({
        type: DocumentSupplyInitFormDto,
        description:
            'Состояние конструктора: компания, тип договора, комплект, товарные строки, инфоблоки.',
    })
    @ApiOkResponse({
        type: DocumentSupplyInitFormResponseDto,
        description: 'Данные формы в ключе init.',
    })
    async getDocumentSupplyReport(
        @Body() dto: DocumentSupplyInitFormDto,
    ): Promise<DocumentSupplyInitFormResponseDto> {
        const init = await this.initFormService.frontInit(dto);
        return { init: init as unknown as Record<string, unknown> };
    }

    @Post('form')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Состав формы отчёта о поставке',
        description:
            '15 полей формы (с портальной настройкой обязательности) по домену, поставщику, типу договора, типу клиента и виду поставки. Замена init-form для нового фронта: без легаси-слепка конструктора.',
    })
    @ApiBody({ type: SupplyReportFormRequestDto })
    @ApiOkResponse({ type: SupplyReportFormResponseDto })
    async form(
        @Body() dto: SupplyReportFormRequestDto,
    ): Promise<SupplyReportFormResponseDto> {
        const supply = await this.initFormService.formFields(dto);
        return { supply: supply as unknown as SupplyReportDto[] };
    }

    @Post('generate-document')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сгенерировать отчёт о поставке',
        description:
            'Собирает docx по шаблону, конвертирует в PDF, пишет комментарий в таймлайн сделки и возвращает абсолютные ссылки. Ссылка file уходит дальше в konstructor/init-supply, где файл скачивается и пишется в RPA-поле supply/current_supply.',
    })
    @ApiBody({
        type: DocumentSupplyReportGenerateDto,
        description:
            'Полное состояние конструктора плюс заполненная форма отчёта (supplyReport).',
    })
    @ApiOkResponse({
        type: DocumentSupplyReportGenerateResponseDto,
        description: 'Ссылки на документ в ключе result.',
    })
    async generateDocument(
        @Body() dto: DocumentSupplyReportGenerateDto,
    ): Promise<DocumentSupplyReportGenerateResponseDto> {
        const result = await this.generateUseCase.execute(dto);
        return { result };
    }
}
