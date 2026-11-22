import { EnumColdCallEntityType, EnumColdCallIsTmc } from '../dto/cold.dto';
import {
    COLD_CALL_OPERATION,
    coldCallCallContext,
    coldCallWindowCallContext,
} from '../lib/cold-call-call-context';
import { IColdCallData } from '../type/cold-hook-silence.interface';

const DOMAIN = 'april-garant.bitrix24.ru';

const hook = (patch: Partial<IColdCallData> = {}): IColdCallData => ({
    entityType: EnumColdCallEntityType.COMPANY,
    entityId: '431',
    responsible: 'user_187',
    isTmc: EnumColdCallIsTmc.N,
    ...patch,
});

describe('подпись холодного обзвона для тревог Битрикса', () => {
    it('хук: карточка из query и ответственный из `user_N`', () => {
        expect(coldCallCallContext(DOMAIN, hook())).toEqual({
            operation: COLD_CALL_OPERATION.hook,
            domain: DOMAIN,
            entity: { type: 'company', id: '431' },
            actor: { userId: 187 },
        });
    });

    it.each([
        [EnumColdCallEntityType.CONTACT, 'contact'],
        [EnumColdCallEntityType.DEAL, 'deal'],
        [EnumColdCallEntityType.LEAD, 'lead'],
    ])('тип карточки %s → %s', (entityType, type) => {
        expect(
            coldCallCallContext(DOMAIN, hook({ entityType })).entity?.type,
        ).toBe(type);
    });

    it('ответственный не передан (читается из карточки позже) — без сотрудника', () => {
        expect(
            coldCallCallContext(DOMAIN, hook({ responsible: undefined })).actor,
        ).toBeUndefined();
    });

    it('окно тишины с одним хуком — его карточка и сотрудник', () => {
        expect(coldCallWindowCallContext(DOMAIN, { a: hook() })).toEqual({
            operation: COLD_CALL_OPERATION.window,
            domain: DOMAIN,
            entity: { type: 'company', id: '431' },
            actor: { userId: 187 },
        });
    });

    it('окно тишины с несколькими хуками — только операция и портал', () => {
        expect(
            coldCallWindowCallContext(DOMAIN, {
                a: hook(),
                b: hook({ entityId: '432' }),
            }),
        ).toEqual({ operation: COLD_CALL_OPERATION.window, domain: DOMAIN });
    });
});
