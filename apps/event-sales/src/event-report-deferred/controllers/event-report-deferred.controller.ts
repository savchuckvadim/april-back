import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    EventReportDeferredRequestDto,
    EventReportDeferredResultDto,
} from '../dto/event-report-deferred.dto';
import { EventReportDeferredService } from '../services/event-report-deferred.service';

/**
 * Досылка ХВОСТА прямого исполнения отчёта.
 *
 * Ручка АДДИТИВНАЯ: обычный `POST /event-sales/flow` не меняется ни строкой.
 * Разница принципиальная — `/flow` исполняет отчёт ЦЕЛИКОМ, а `/flow/deferred`
 * доделывает только то, на что у браузера не было прав, потому что ядро уже
 * исполнено им самим.
 *
 * Префикс и доступ — те же, что у `/event-sales/flow` (открытый контроллер
 * приложения, гардов нет).
 */
@ApiTags('Event Sales')
@Controller('event-sales')
export class EventReportDeferredController {
    constructor(private readonly service: EventReportDeferredService) {}

    @Post('flow/deferred')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Досылка хвоста прямого исполнения отчёта',
        description:
            'Доделывает шаги отчёта, которые браузер выполнить не смог: ' +
            'записи KPI (`kpi`), движения сделок воронок «Презентации» ' +
            '(`pres-deals`) и «ХО» (`xo-deals`), элементы смартов ЗПР и ' +
            '«Презентаций» вместе с ответами анкеты (`side-flow` + `flow`), ' +
            'синхронизацию заявок (`lead-request-sync`) и уведомление о ' +
            'переносе (`transfer-notify`). ' +
            'ЯДРО ОТЧЁТА НЕ ИСПОЛНЯЕТСЯ: карточку клиента, задачу и историю ' +
            'уже записал браузер, повтор был бы вторым отчётом по одному ' +
            'событию. Поэтому исходный payload едет сюда ТОЛЬКО как источник ' +
            'данных для перечисленных шагов — слать его в `POST ' +
            '/event-sales/flow` после прямого исполнения запрещено. ' +
            'Повтор пары (operationId, шаг) не выполняется второй раз ' +
            '(отметка живёт 7 суток; у KPI и сайд-джобов есть собственный ' +
            'дедуп). Один упавший шаг не мешает остальным: ответ перечисляет ' +
            'исход каждого шага, а список `pending` — то, что фронт обязан ' +
            'оставить в конверте и повторить.',
    })
    @ApiBody({ type: EventReportDeferredRequestDto })
    @ApiOkResponse({
        type: EventReportDeferredResultDto,
        description: 'Исход каждого шага: исполнен / уже был / упал.',
    })
    async deferred(
        @Body() dto: EventReportDeferredRequestDto,
    ): Promise<EventReportDeferredResultDto> {
        return this.service.execute(dto);
    }
}
