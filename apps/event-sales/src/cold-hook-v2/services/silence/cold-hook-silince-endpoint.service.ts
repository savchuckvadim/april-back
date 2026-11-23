import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
    IColdCallData,
    IColdHookSilenceHandlerData,
} from '../../type/cold-hook-silence.interface';
import {
    EventSilentJobManagerData,
    EventSilentJobManagerHandler,
    EventSilentJobManagerService,
    SILENCE_EVENT_PREFIX,
} from '@lib/core/event-silence';
import { JobNames } from '@lib/queue';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { ColdCallHookResponseDto } from '../../dto/cold-call-response.dto';
import { XoLaunchRegistryService } from '../../../shared/xo-dispatch/launch/xo-launch-registry.service';
import {
    XoLaunch,
    xoLaunchEntityKey,
} from '../../../shared/xo-dispatch/launch/xo-launch.rule';

@Injectable()
export class ColdHookSilinceEndpointV2Service {
    private readonly logger = new Logger(ColdHookSilinceEndpointV2Service.name);

    constructor(
        private readonly silentManager: EventSilentJobManagerService,
        private readonly queueDispatcher: QueueDispatcherService,
        private readonly launches: XoLaunchRegistryService,
    ) {}

    /**
     * Приём холодного звонка — от робота (контроллер), крона подстраховки и
     * реанимации отказников: все идут сюда.
     *
     * Каждый запуск получает отметку (номер и время приёма) — по ней
     * обработчик окна опознает повторный запуск по тому же клиенту
     * («выигрывает первый», `xo-launch.rule`). После постановки в окно
     * карточка помечается «ждёт обработки», чтобы крон подстраховки не
     * досылал её, пока хук стоит в очереди.
     */
    async createColdCallHook(
        domain: string,
        rawData: IColdCallData,
    ): Promise<ColdCallHookResponseDto> {
        const launch: XoLaunch = { id: randomUUID(), acceptedAt: Date.now() };
        const coldCallData: IColdCallData = { ...rawData, launch };
        const domainKey = domain.replace(/\./g, '_');
        /*
         * Окно тишины группируется по ответственному — так burst по
         * одному менеджеру схлопывается в одну обработку.
         *
         * Ответственный может НЕ прийти в запросе: с 2026-09 он читается из
         * карточки, а на момент приёма хука карточка ещё не прочитана. Тогда
         * группируем весь домен в одно окно — это ровно то, чего хочет
         * схлопывание. Подставлять сюда `undefined` строкой нельзя: ключ
         * становится нечитаемым в логах и в ответе эндпоинта.
         */
        const groupKey = coldCallData.responsible ?? 'from_card';
        const keyPrefix = `XO2_event_sales_cold_call_${domainKey}_${groupKey}`;
        this.logger.log(
            `[DEADLINE][silent] createColdCallHook enter domain=${domain} keyPrefix=${keyPrefix} ` +
                `entityType=${coldCallData.entityType} entityId=${coldCallData.entityId} ` +
                `responsible=${coldCallData.responsible} rawDeadline="${coldCallData.deadline}"`,
        );

        const ddosItem: EventSilentJobManagerData<IColdCallData> = {
            keyPrefix,
            data: coldCallData,
            jobName: JobNames.EVENT_COLD_CALL_V2,
            domain,
        };

        await this.silentManager.handle<IColdCallData>(ddosItem);
        // Строго ПОСЛЕ постановки: не попал хук в окно — отметка не нужна,
        // иначе крон час не досылал бы карточку, которую никто не обработает.
        await this.launches.markPending(
            domain,
            xoLaunchEntityKey(coldCallData.entityType, coldCallData.entityId),
            launch,
        );
        this.logger.log(
            `[DEADLINE][silent] createColdCallHook exit keyPrefix=${keyPrefix} ` +
                `rawDeadline="${coldCallData.deadline}" (буфер; реальная обработка асинхронна)`,
        );

        return {
            accepted: true,
            domain,
            keyPrefix,
            // Пусто — дедлайн придёт из поля карточки при обработке.
            rawDeadline: coldCallData.deadline ?? '',
            message: 'Холодный звонок принят и поставлен в очередь обработки.',
        };
    }

    /**
     * Окно тишины закрылось — передаём его в свою очередь, где окна одного
     * портала идут строго по одному (`ColdHooksV2Processor`). Сами здесь не
     * работаем: сборщики event-silent общие для всех хуков.
     *
     * Без `{ async: true }`: с ним EventEmitter2 зовёт слушателя через
     * setImmediate и НЕ ждёт его, задание event-silent закрывается сразу —
     * постановка в очередь могла не случиться, а ошибка терялась.
     */
    @OnEvent(`${SILENCE_EVENT_PREFIX}:${JobNames.EVENT_COLD_CALL_V2}`)
    async onColdCallSilence(
        data: EventSilentJobManagerHandler<IColdCallData>,
    ): Promise<void> {
        const job: IColdHookSilenceHandlerData = {
            collected: data.collected,
            payload: data.payload,
        };
        this.logger.log(
            `[silence event] cold-call v2 → очередь, domain=${data.payload.domain} collected=${Object.keys(data.collected).length}`,
        );
        await this.queueDispatcher.dispatch(
            QueueNames.EVENT_SALES_COLD_CALL_V2,
            JobNames.EVENT_COLD_CALL_V2,
            job,
        );
    }
}
