import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    PresentationSurveyDto,
    PresentationSurveyResultDto,
    UnplannedPresentationSignalDto,
    UnplannedSignalResultDto,
} from '../dto/presentation-survey.dto';
import { PresentationSurveyEndpointService } from '../services/presentation-survey-endpoint.service';

/**
 * ЛЕГАСИ-МОСТ: приём анкеты после презентации от старого React-фронта —
 * хвост и «5К» отдельным запросом, вне event-report flow. Префикс и доступ
 * — те же, что у `/event-sales/flow` (открытый контроллер приложения,
 * гардов нет).
 *
 * Новый фронт сюда НЕ ходит: те же ответы едут в payload отчёта
 * (`presentation.survey` в `EventSalesFlowDto`) и пишутся основным потоком
 * тем же батчем, что и сам отчёт. Удалить этот контроллер вместе со
 * старым фронтом.
 */
@ApiTags('Event Sales')
@Controller('event-sales')
export class PresentationSurveyController {
    constructor(private readonly service: PresentationSurveyEndpointService) {}

    @Post('presentation-survey')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Анкета после презентации: хвост и «5К»',
        description:
            'Перезаписывает ответы анкеты в поля клиента: лид и сделки ' +
            'получают весь состав (девять детальных «5К» + шесть ' +
            '«Разговора» + оба сводных), компания — только сводные ' +
            '(«Хвост», «Пять К»). Жёсткий серверный whitelist: ключи fiveK вне списка ' +
            'op_5k_* молча отбрасываются. Только перезапись (append нет) — ' +
            'повтор того же payload даёт тот же результат; повтор ' +
            'operationId в течение 24ч не пишется второй раз. Пустые ' +
            'values — no-op без похода в Битрикс. Неустановленное на ' +
            'портале поле пропускается с warning в ответе.',
    })
    @ApiBody({ type: PresentationSurveyDto })
    @ApiOkResponse({
        type: PresentationSurveyResultDto,
        description: 'Итог записи: кто обновлён, что пропущено.',
    })
    async submit(
        @Body() dto: PresentationSurveyDto,
    ): Promise<PresentationSurveyResultDto> {
        return this.service.submit(dto);
    }

    @Post('presentation-survey/unplanned-signal')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сигнал hook: создана unplanned-сделка презентации',
        description:
            'Маленький POST от hook в конце его потока — без значений ' +
            'опросника. Если значения уже пришли от легаси-фронта, сводные ' +
            '(«Хвост», «Пять К») дописываются в unplanned-сделку сразу ' +
            '(matched). Если сигнал обогнал опросник — он ждёт до часа ' +
            '(pending), и опросник допишет сводные сам. Повтор сигнала по ' +
            'той же сделке после записи — deduplicated. Redis недоступен — ' +
            'мягкая деградация с warning, ошибок наружу нет.',
    })
    @ApiBody({ type: UnplannedPresentationSignalDto })
    @ApiOkResponse({
        type: UnplannedSignalResultDto,
        description: 'Итог: записано / ждёт опросника / повтор.',
    })
    async unplannedSignal(
        @Body() dto: UnplannedPresentationSignalDto,
    ): Promise<UnplannedSignalResultDto> {
        return this.service.signal(dto);
    }
}
