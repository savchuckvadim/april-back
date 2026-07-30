import {
    BadRequestException,
    Body,
    Controller,
    HttpCode,
    Logger,
    Post,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PBXService } from '@/modules/pbx';
import type { IsoDate } from '../../shared/lib/month-segments.util';
import { AIRTIME_MAX_MONTHS_PER_REQUEST } from '../constants/airtime-queue.const';
import {
    AirtimeStatisticResponseDto,
    GetAirtimeStatisticDto,
} from '../dto/airtime-statistic.dto';
import { AirtimeStatisticUseCase } from '../use-cases/kpi-airtime.use-case';
import { AirtimeCacheService } from '../cache/airtime-cache.service';
import { AirtimeAssemblyService } from '../services/airtime-assembly.service';
import { AirtimeDispatchService } from '../services/airtime-dispatch.service';
import { parseDepartamentUserIds } from '../lib/airtime-cell.util';
import { buildAirtimeRequestKey } from '../queue/airtime-job-id.util';
import type { AirtimeReadiness } from '../services/airtime-assembly.service';

/**
 * Отчёт «эфирное время» — альтернатива счётной статистике
 * kpi-report/calling-statistic.
 *
 * Два режима (поле mode):
 *  - queue — паттерн «кэш-синхронно + очередь при промахе» (ai/rules/
 *    heavy-endpoint-queue.md): контроллер только читает маркеры/ячейки и
 *    ставит job'ы месячных партиций, HTTP отвечает мгновенно;
 *  - sync (default) — легаси-путь для старого фронта: расчёт прямо в
 *    HTTP-запросе. После перевода фронта на queue будет удалён.
 */
@ApiTags('Sales Airtime')
@Controller('kpi-airtime')
export class KpiAirtimeController {
    private readonly logger = new Logger(KpiAirtimeController.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly airtimeCache: AirtimeCacheService,
        private readonly assembly: AirtimeAssemblyService,
        private readonly dispatch: AirtimeDispatchService,
    ) {}

    @Post('get')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Эфирное время менеджеров',
        description:
            'Считает по каждому сотруднику отдела суммарное время телефонной ' +
            'коммуникации (сумма CALL_DURATION из voximplant.statistic.get) ' +
            'за период, с разбивкой на входящие и исходящие звонки. ' +
            'Режим queue: ответ мгновенный — status ready (отчёт из кэша ' +
            'месячных партиций) или queued (сбор идёт: прогресс в progress, ' +
            'готовность — WS-событием airtime:done на socketId либо ' +
            'поллингом — повторными POST до status ready; ошибка сбора — ' +
            'status error). Партиции собираются по ВСЕМУ порталу: смена ' +
            'состава отдела на прогретом периоде не ходит в Битрикс. ' +
            `Период — не больше ${AIRTIME_MAX_MONTHS_PER_REQUEST} месяцев; ` +
            "job'ы ставятся порциями, продолжение подтягивает поллинг " +
            '(заброшенный запрос затухает сам). ' +
            'Без mode — легаси-синхронный расчёт (для старого фронта).',
    })
    @ApiBody({
        type: GetAirtimeStatisticDto,
        description:
            'Домен портала, фильтры (отдел, период, лимит строк) и режим.',
    })
    @ApiOkResponse({
        type: AirtimeStatisticResponseDto,
        description:
            'Эфирное время по каждому сотруднику + метаданные выгрузки; ' +
            'в режиме queue дополнительно status/progress/requestKey.',
    })
    async getAirtimeStatistic(
        @Body() dto: GetAirtimeStatisticDto,
    ): Promise<AirtimeStatisticResponseDto> {
        if (dto.mode === 'queue') {
            return this.handleQueueMode(dto);
        }
        return this.handleLegacySync(dto);
    }

    /** Легаси-путь: расчёт в HTTP-запросе (поведение до введения очереди). */
    private async handleLegacySync(
        dto: GetAirtimeStatisticDto,
    ): Promise<AirtimeStatisticResponseDto> {
        const { dateFrom, dateTo } = dto.filters;
        if (dateFrom.slice(0, 7) !== dateTo.slice(0, 7)) {
            this.logger.warn(
                `[${dto.domain}] deprecated sync-режим kpi-airtime на ` +
                    `многомесячном периоде ${dateFrom}..${dateTo} — ` +
                    'переведите клиент на mode=queue',
            );
        }
        const { bitrix } = await this.pbx.init(dto.domain);
        const airtimeUseCase = new AirtimeStatisticUseCase(
            bitrix.api,
            this.airtimeCache,
            dto.domain,
        );
        return await airtimeUseCase.get(dto);
    }

    /**
     * Режим очереди: readiness по маркерам → готово всё: сборка из кэша;
     * иначе job'ы на недостающие партиции + мгновенный queued/error-ответ.
     * Bitrix из HTTP-потока не вызывается вообще.
     */
    private async handleQueueMode(
        dto: GetAirtimeStatisticDto,
    ): Promise<AirtimeStatisticResponseDto> {
        const domain = dto.domain;
        // Очередь оперирует целыми днями: границы с временем срезаются до
        // даты (UI и так day-гранулярный; sync-режим сохраняет точные края).
        const fromIso = dto.filters.dateFrom.slice(0, 10) as IsoDate;
        const toIso = dto.filters.dateTo.slice(0, 10) as IsoDate;
        this.assertPeriodWithinCap(fromIso, toIso);
        const forceRefresh = dto.forceRefresh === true;
        const requestKey = buildAirtimeRequestKey(
            fromIso,
            toIso,
            parseDepartamentUserIds(dto.filters.departament),
        );

        const readiness = await this.assembly.checkReadiness(
            domain,
            fromIso,
            toIso,
            forceRefresh,
        );

        if (readiness.allReady) {
            const report = await this.assembly.assemble(
                domain,
                readiness,
                dto.filters.departament,
            );
            return { ...report, status: 'ready', requestKey };
        }

        // Недостающие партиции — в очередь (error-юниты без forceRefresh
        // пропускаются диспетчером, пока жив error-маркер).
        await this.dispatch.dispatchMissing(domain, readiness, {
            socketId: dto.socketId,
            requestKey,
            dateFrom: fromIso,
            dateTo: toIso,
            forceRefresh,
        });

        // Частичные данные уже собранных месяцев — фронт показывает таблицу
        // «под стеклом» с прогрессом, а не пустой скелетон.
        const partial = readiness.readyMonths
            ? await this.assembly.assemble(
                  domain,
                  {
                      ...readiness,
                      units: readiness.units.filter(
                          unit => unit.status === 'ready',
                      ),
                  },
                  dto.filters.departament,
              )
            : { users: [], rowsFetched: 0, truncated: false };

        return {
            ...partial,
            status: readiness.hasError ? 'error' : 'queued',
            progress: this.toProgress(readiness),
            requestKey,
            ...(readiness.hasError
                ? {
                      message:
                          readiness.errorMessage ??
                          'Сбор статистики завершился ошибкой. Нажмите «Пересчитать».',
                  }
                : {}),
        };
    }

    /**
     * Кап периода — защита прода и Битрикса от «выбрали 10 лет»: сотни
     * месячных прогонов под лимитером вместо отчёта. Считаем месяцы
     * арифметикой по yyyy-MM, без построения сегментов.
     */
    private assertPeriodWithinCap(fromIso: IsoDate, toIso: IsoDate): void {
        const [fromYear, fromMonth] = fromIso.split('-').map(Number);
        const [toYear, toMonth] = toIso.split('-').map(Number);
        const months = (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1;
        if (months > AIRTIME_MAX_MONTHS_PER_REQUEST) {
            throw new BadRequestException(
                `Период слишком большой: ${months} месяцев при лимите ` +
                    `${AIRTIME_MAX_MONTHS_PER_REQUEST}. Сузьте период отчёта.`,
            );
        }
    }

    private toProgress(readiness: AirtimeReadiness) {
        return {
            totalMonths: readiness.totalMonths,
            readyMonths: readiness.readyMonths,
            months: readiness.months.map(({ month, status }) => ({
                month,
                status,
            })),
            ...(readiness.etaSeconds !== undefined
                ? { etaSeconds: readiness.etaSeconds }
                : {}),
        };
    }
}
