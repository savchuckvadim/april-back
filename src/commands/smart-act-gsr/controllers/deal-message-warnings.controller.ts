import { Controller, Get, Injectable } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SendDealsWarningsUseCase } from '../usecases/send-deals-warnings.use-case';

@Injectable()
@ApiTags('Commands Deal Message Warnings')
@Controller('commands/smart-act-gsr')
export class DealMessageWarningsController {
    constructor(private readonly useCase: SendDealsWarningsUseCase) {}

    @Get('report')
    async getReport() {
        return await this.useCase.execute('admin', 'gsr.bitrix24.ru');
    }
}

/**
 * Сообщения отправляются


 * оформлять все с помощью bb code по документации битрикс отправка сообщений
 * ФОРМА СООБЩЕНИЯ ПО  ПУСТЫМ ПОЛЯМ КОНТРАКТА
 * Сотрудник Галина Петрова
 * Количество Сделок с пустым "действия договора с" 3
 *  - ООО Пирожок (название компании - надо запросить отдельно после запроса сделок)
 *  - ООО Пирожок (также должна быть ссылка на сделку)
 *  - ООО Пирожок
 *
 *  * Количество Сделок с пустым "действия договора по" 3
 *  - ООО Пирожок (название компании - надо запросить отдельно после запроса сделок)
 *  - ООО Пирожок
 *  - ООО Пирожок
 *
 *
 *  * ФОРМА СООБЩЕНИЯ ПО ВОЗМОЖНЫМ ДУБЛЯМ
 *  Сотрудник Галина Петрова
 *  - ООО Пирожок (название компании - надо запросить отдельно после запроса сделок, ссылка на компанию)
 *    причина совпадают месяцы начала договора: апрель 2026
 *    причина совпадают месяцы окончания договора: апрель 2026
 *
 */
