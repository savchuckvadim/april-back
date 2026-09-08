import { resolveCallManagerId } from '../services/call-manager.util';

/**
 * Прод-баг 08.09.2026 (alfacentr): аналитика включена на одного сотрудника,
 * звонки разбирались реально его, а «Ответственный» карточки и автор записей
 * таймлайна прилетали из ASSIGNED_BY_ID сделки — часто чужой и чужой воронки.
 */
describe('resolveCallManagerId — ответственный разбора звонка', () => {
    it('владелец звонка из телефонии главнее ответственного сделки', () => {
        expect(
            resolveCallManagerId({
                callOwnerUserId: '222',
                entityManagerId: 317,
                entityIsOwn: true,
            }),
        ).toBe(222);
    });

    it('владельца звонка нет, сделка своя — берём её ответственного', () => {
        expect(
            resolveCallManagerId({
                callOwnerUserId: null,
                entityManagerId: 317,
                entityIsOwn: true,
            }),
        ).toBe(317);
    });

    it('владельца звонка нет, сделка ЧУЖОЙ воронки — не подставляем наугад', () => {
        expect(
            resolveCallManagerId({
                callOwnerUserId: null,
                entityManagerId: 317,
                entityIsOwn: false,
            }),
        ).toBeUndefined();
    });

    it('владелец звонка известен — чужая воронка сделки уже не важна', () => {
        expect(
            resolveCallManagerId({
                callOwnerUserId: '222',
                entityManagerId: 317,
                entityIsOwn: false,
            }),
        ).toBe(222);
    });

    it('мусорные значения владельца игнорируются (пусто, ноль, не число)', () => {
        for (const callOwnerUserId of ['', '0', 'abc', null, undefined]) {
            expect(
                resolveCallManagerId({
                    callOwnerUserId,
                    entityManagerId: 317,
                    entityIsOwn: true,
                }),
            ).toBe(317);
        }
    });

    it('ни владельца, ни ответственного — поле остаётся пустым', () => {
        expect(
            resolveCallManagerId({
                callOwnerUserId: null,
                entityManagerId: 0,
                entityIsOwn: true,
            }),
        ).toBeUndefined();
        expect(resolveCallManagerId({})).toBeUndefined();
    });
});
