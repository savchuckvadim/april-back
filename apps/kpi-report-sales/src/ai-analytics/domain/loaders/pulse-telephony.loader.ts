import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { BxVoximplantStatisticService } from '@lib/bitrix/domain/telephony';
import { ManagersLoader } from './managers.loader';
import { portalRangeUtc } from './period.util';
import {
    pulseScopeSalesOnly,
    pulseTelephonyUserIds,
} from './pulse-telephony.scope';
import type { AiCallReportStatus } from './settings.loader';

/** Окно и порог, по которым считается доля коротких разговоров. */
export interface PulseTelephonyInput {
    /** Первый и последний день окна пульса (YYYY-MM-DD в TZ портала). */
    from: string;
    to: string;
    timeZone: string;
    /** Порог «короткого» звонка, с (тот же, что у пульса). */
    minDurationSec: number;
    callReport?: AiCallReportStatus;
}

/** Разговоры окна по телефонии: всего и короче порога. */
export interface PulseShortShare {
    /** Состоявшихся разговоров (длительность > 0) у сотрудников разбора. */
    connected: number;
    /** Из них короче порога — их AI не разбирает. */
    short: number;
}

/**
 * Доля коротких разговоров пульса — из телефонии Битрикса, а не из
 * выборки разборов: туда короткие звонки не попадают вовсе, и доля
 * «0 % короче порога» была неправдой (april-garant 05.11.2026: на деле
 * 97 %). Два лёгких запроса `voximplant.statistic.get` — только `total`.
 * Недозвоны (длительность 0) не считаются: это не разговор.
 *
 * Fail-open: сбой Битрикса или портал без total → null, пульс отдаётся без
 * доли. Bitrix-инстанс берётся на вызов, в поля не кладётся.
 */
@Injectable()
export class PulseTelephonyLoader {
    private readonly logger = new Logger(PulseTelephonyLoader.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly managers: ManagersLoader,
    ) {}

    async shortShare(
        domain: string,
        input: PulseTelephonyInput,
    ): Promise<PulseShortShare | null> {
        try {
            const userIds = pulseTelephonyUserIds({
                callReport: input.callReport,
                salesRoster: pulseScopeSalesOnly(input.callReport)
                    ? await this.managers.resolve(domain)
                    : null,
            });
            const { from, to } = portalRangeUtc(
                input.from,
                input.to,
                input.timeZone,
            );
            const { bitrix } = await this.pbx.init(domain);
            const telephony = new BxVoximplantStatisticService(bitrix);
            const base = {
                fromIso: from.toISOString(),
                toIso: to.toISOString(),
                minDurationSec: 1,
                ...(userIds ? { userIds } : {}),
            };
            const connected = await telephony.countCalls(base);
            const short = await telephony.countCalls({
                ...base,
                maxDurationSecExclusive: input.minDurationSec,
            });
            if (connected === null || short === null) return null;
            return { connected, short: Math.min(short, connected) };
        } catch (error) {
            this.logger.warn(
                `Доля коротких разговоров пульса (${domain}) не посчитана: ${(error as Error).message}`,
            );
            return null;
        }
    }
}
