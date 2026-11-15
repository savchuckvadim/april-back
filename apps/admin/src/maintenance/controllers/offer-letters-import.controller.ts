import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    OfferLettersImportDto,
    OfferLettersImportResponseDto,
} from '../dto/offer-letters-import.dto';
import { OfferLettersImportService } from '../services/offer-letters-import.service';

/** Временная ручка: после переноса писем удалить вместе с сервисом. */
@ApiTags('Admin Maintenance')
@Controller('admin/maintenance/offer-letters')
export class OfferLettersImportController {
    constructor(private readonly service: OfferLettersImportService) {}

    @Post('import-legacy')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Перенести письма КП порталов из легаси-шаблонов',
        description:
            'Временная ручка. Берёт письмо каждого портала из легаси-шаблона `offer` ' +
            '(поле `letter`) и создаёт письмо портала в `offer_letters`. По умолчанию ' +
            'запуск «сухой»: только показывает, что будет перенесено. Чтобы записать, ' +
            'передать dryRun: false. Повторный запуск безопасен — перенесённое не дублируется.',
    })
    @ApiBody({ type: OfferLettersImportDto })
    @ApiOkResponse({
        type: OfferLettersImportResponseDto,
        description: 'Письма порталов и что с каждым сделано',
    })
    async importLegacy(
        @Body() dto: OfferLettersImportDto,
    ): Promise<OfferLettersImportResponseDto> {
        return this.service.importLegacy(dto);
    }
}
