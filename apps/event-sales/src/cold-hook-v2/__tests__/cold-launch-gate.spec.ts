import { InMemoryLaunchRegistry } from '../../shared/xo-dispatch/launch/__tests__/in-memory-launch-registry';
import { EnumColdCallEntityType, EnumColdCallIsTmc } from '../dto/cold.dto';
import {
    coldClientKey,
    ColdLaunchGate,
} from '../services/silence/cold-launch-gate';
import { ColdTarget } from '../services/target/cold-target.types';
import { IColdCallData } from '../type/cold-hook-silence.interface';

const DOMAIN = 'gsr.bitrix24.ru';

const hook = (
    entityType: EnumColdCallEntityType,
    entityId: string,
    launch?: { id: string; acceptedAt: number },
): IColdCallData => ({
    entityType,
    entityId,
    isTmc: EnumColdCallIsTmc.N,
    ...(launch ? { launch } : {}),
});

const companyTarget = (
    hookKey: string,
    data: IColdCallData,
    companyId = 117743,
): ColdTarget => ({
    hookKey,
    hook: data,
    kind: 'company',
    company: { ID: String(companyId) } as never,
    companyId,
    entryDeal: null,
    rootDealId: null,
});

describe('клиент для правила «выигрывает первый»', () => {
    it('компания — клиент, откуда бы ни запускали (из компании или её сделки)', () => {
        const fromDeal: ColdTarget = {
            ...companyTarget('h', hook(EnumColdCallEntityType.DEAL, '500')),
            entryDeal: { ID: '500' } as never,
        };
        expect(coldClientKey(fromDeal)).toBe('company:117743');
    });

    it('без компании — основная сделка, без неё — сделка запуска', () => {
        const base: ColdTarget = {
            hookKey: 'h',
            hook: hook(EnumColdCallEntityType.DEAL, '600'),
            kind: 'deal',
            company: null,
            companyId: null,
            entryDeal: { ID: '600' } as never,
            rootDealId: 590,
        };
        expect(coldClientKey(base)).toBe('deal:590');
        expect(coldClientKey({ ...base, rootDealId: null })).toBe('deal:600');
    });
});

describe('привратник окна холодного старта', () => {
    it('повтор по клиенту, пока шёл первый, — в «повторы»; другие клиенты работают', async () => {
        const registry = new InMemoryLaunchRegistry();
        await registry.markDone(
            DOMAIN,
            [
                {
                    clientKey: 'company:117743',
                    launch: { id: 'L1', acceptedAt: 1000 },
                },
            ],
            5000,
        );
        const gate = new ColdLaunchGate(registry, DOMAIN);
        const repeat = companyTarget(
            'h2',
            hook(EnumColdCallEntityType.COMPANY, '117743', {
                id: 'L2',
                acceptedAt: 2000,
            }),
        );
        const other = companyTarget(
            'h3',
            hook(EnumColdCallEntityType.COMPANY, '1', {
                id: 'L3',
                acceptedAt: 2000,
            }),
            1,
        );

        const split = await gate.split([repeat, other]);

        expect(split.repeated).toEqual([repeat]);
        expect(split.proceed).toEqual([other]);
        expect(split.redelivered).toEqual([]);
    });

    it('завершённые запуски записываются по клиенту, хуки без отметки пропускаются', async () => {
        const registry = new InMemoryLaunchRegistry();
        const gate = new ColdLaunchGate(registry, DOMAIN);
        const launched = companyTarget(
            'h1',
            hook(EnumColdCallEntityType.COMPANY, '117743', {
                id: 'L1',
                acceptedAt: 1000,
            }),
        );
        const legacy = companyTarget(
            'h2',
            hook(EnumColdCallEntityType.COMPANY, '1'),
            1,
        );

        await gate.markDone([launched, legacy], 5000);

        expect(registry.doneByClient.get(`${DOMAIN}|company:117743`)).toEqual({
            launchId: 'L1',
            acceptedAt: 1000,
            finishedAt: 5000,
        });
        expect(registry.doneByClient.has(`${DOMAIN}|company:1`)).toBe(false);
    });

    it('после окна снимаются отметки «ждёт обработки» всех его хуков', async () => {
        const registry = new InMemoryLaunchRegistry();
        const launch = { id: 'L1', acceptedAt: 1000 };
        await registry.markPending(DOMAIN, 'company:117743', launch);
        const gate = new ColdLaunchGate(registry, DOMAIN);

        await gate.clearPending({
            '1': hook(EnumColdCallEntityType.COMPANY, '117743', launch),
        });

        expect(await registry.pending(DOMAIN, ['company:117743'])).toEqual(
            new Set(),
        );
    });
});
