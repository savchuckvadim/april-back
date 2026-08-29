import { Injectable, Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { WsService } from '@/core/ws';
import { SideFlowGuardService } from '../shared/side-flow';
import { ZprFlowService } from './zpr-flow.service';
import { ZprFlowJobData } from './dto/zpr-flow-job.dto';
import {
    ZPR_FLOW_ACTIONS,
    ZPR_FLOW_WS_EVENTS,
    ZprFlowAction,
    ZprFlowDonePayload,
} from './constants/zpr-flow.const';

/**
 * Воркер сайд-очереди ЗПР. Ошибка джоба логируется и НЕ ретраится вечно
 * (джоб ставится без retry): элемент смарта — дополнение к отчёту, а не
 * его условие; потерянный элемент виден по логу и восстановим руками.
 *
 * Повторная доставка (Bull доставляет at-least-once) проходит через отметку
 * {@link SideFlowGuardService}, и порядок здесь — половина защиты: отметка
 * ставится ДО работы (`begin`) и лишь подтверждается исходом (`complete`).
 * Ставь её после записи — и падение воркера внутри этого окна давало бы
 * дубль элемента, то есть ровно то, от чего гейт заведён. Повтор,
 * заставший отметку неподтверждённой, Битрикс не трогает: тихий дубль с
 * копией ответов менеджера хуже потерянного элемента, о котором в логе
 * есть строка.
 *
 * По успеху шлёт `zpr-flow:done` ТОЧЕЧНО в socketId клиента (как основной
 * flow) — фронт по нему перечитывает слайс ЗПР. Комнат/broadcast по userId
 * нет намеренно: id юзера уникален только в рамках портала.
 *
 * Concurrency остаётся 1 (в отличие от основного flow, где 4 + лок по
 * клиенту): один отчёт может поставить ДВА джоба — сначала закрыть текущий
 * элемент, потом создать следующий, — и порядок между ними обязателен.
 * Параллельный воркер создал бы новый элемент раньше, чем закрылся старый,
 * и «открытым» для следующего отчёта оказался бы не тот. Джобы лёгкие
 * (1–3 вызова), очередь не копится.
 */
@Injectable()
@Processor(QueueNames.EVENT_SALES_ZPR_FLOW)
export class ZprFlowProcessor {
    private readonly logger = new Logger(ZprFlowProcessor.name);

    constructor(
        private readonly service: ZprFlowService,
        private readonly ws: WsService,
        private readonly guard: SideFlowGuardService,
    ) {
        this.logger.log('ZprFlowProcessor initialized');
    }

    @Process(JobNames.EVENT_SALES_ZPR_FLOW)
    async handle(job: Job<ZprFlowJobData>): Promise<void> {
        const ref = {
            domain: job.data.domain,
            flow: 'zpr-flow' as const,
            operationId: job.data.operationId,
            kind: job.data.kind,
        };
        try {
            /*
             * Гейт повторной доставки (Bull доставляет at-least-once).
             * Повтор НЕ трогает Битрикс: закрывающий джоб не нашёл бы
             * уже закрытый элемент и завёл бы спонтанный дубль, а
             * перенос удвоил бы счётчик и ленту. Клиенту при этом
             * отвечаем тем же исходом — фронт не должен заметить.
             */
            const seen = await this.guard.recall(ref);
            if (seen?.status === 'done') {
                this.logger.warn(
                    `[zpr-flow] джоб ${job.id} (op=${job.data.operationId ?? '-'}, ` +
                        `${job.data.kind}) уже отработал ${seen.at} → элемент ` +
                        `${seen.elementId ?? '-'}: повторная доставка, Битрикс не трогаем`,
                );
                this.notify(job.data, {
                    action: this.toAction(seen.action),
                    elementId: seen.elementId,
                });
                return;
            }
            /*
             * Прошлый прогон начался и исхода не подтвердил: воркер
             * оборвался между записью в Битрикс и отметкой. Записал он
             * или нет, отсюда не видно — и мы НЕ переспрашиваем. Дубль
             * элемента тих и увозит копию ответов менеджера, а потерянный
             * элемент виден вот этой строкой и восстановим руками
             * (правило раздела: элемент — дополнение к отчёту).
             */
            if (seen) {
                this.logger.error(
                    `[zpr-flow] джоб ${job.id} (op=${job.data.operationId ?? '-'}, ` +
                        `${job.data.kind}) начался ${seen.at} и исход не подтвердил: ` +
                        'повторная доставка, Битрикс НЕ трогаем — прошлый прогон мог ' +
                        `успеть записать элемент. Проверьте смарт ЗПР ${job.data.domain} руками`,
                );
                return;
            }

            /*
             * Отметка ДО работы: поставь её после записи, и падение внутри
             * этого окна дало бы ровно тот дубль, ради которого гейт и
             * заведён. Не записалась (кэш лёг) — работаем всё равно,
             * гейт для этого джоба просто выключен.
             */
            await this.guard.begin(ref);
            const result = await this.service.handle(job.data);
            // Подтверждение раньше события: окно между записью в Битрикс и
            // отметкой должно быть как можно короче, а фронту WS-событие
            // ничего не стоит подождать один вызов кэша.
            await this.guard.complete(ref, result);
            this.notify(job.data, result);
        } catch (error) {
            /*
             * Отметку НЕ снимаем: упасть можно и после того, как элемент
             * уже создан, а повтор, увидевший `started`, честно откажется
             * трогать Битрикс. Джоб ставится без retry — своей ошибкой
             * он никого не блокирует.
             */
            this.logger.error(
                `[zpr-flow] джоб ${job.id} (${job.data.domain}, op=${job.data.operationId ?? '-'}) упал: ${(error as Error).message}`,
            );
        }
    }

    /**
     * Исход отметки → действие потока. Незнакомое значение (формат отметки
     * сменился между деплоями) читается как `skipped`: события клиенту не
     * будет, но и выдуманного исхода тоже.
     */
    private toAction(action: string | null): ZprFlowAction {
        return ZPR_FLOW_ACTIONS.find(known => known === action) ?? 'skipped';
    }

    /**
     * Исход → клиенту, поставившему отчёт. Точечно в socketId: комнат
     * и адресации по userId нет намеренно — id юзера уникален только
     * в рамках портала. Пропуск (смарт не установлен) событием не
     * является: фронту нечего перечитывать.
     */
    private notify(
        data: ZprFlowJobData,
        result: { action: ZprFlowAction; elementId: number | null },
    ): void {
        if (!data.socketId || result.action === 'skipped') return;
        const payload: ZprFlowDonePayload = {
            ...result,
            domain: data.domain,
            operationId: data.operationId,
            kind: data.kind,
        };
        this.ws.sendToClient(data.socketId, {
            event: ZPR_FLOW_WS_EVENTS.DONE,
            data: payload,
        });
    }
}
