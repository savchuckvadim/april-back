import { Role } from '@lib/auth';
import { toCabinetSubject } from '../cabinet-subject';
import { hasCabinetLevel } from '../cabinet.constants';

describe('toCabinetSubject (кто пришёл в кабинет)', () => {
    it('SUPER_USER — администратор April', () => {
        expect(
            toCabinetSubject({
                sub: 'admin',
                login: 'admin',
                role: Role.SUPER_USER,
            }),
        ).toEqual({ kind: 'platform', login: 'admin' });
    });

    it('вход с сайта: sub=user:<id> → учётка', () => {
        expect(
            toCabinetSubject({
                sub: 'user:17',
                login: 'a@b.ru',
                role: Role.CLIENT,
                userId: 17,
            }),
        ).toEqual({ kind: 'account', userId: BigInt(17), login: 'a@b.ru' });
    });

    it('учётка с мусорным id — не субъект', () => {
        expect(
            toCabinetSubject({
                sub: 'user:abc',
                login: 'x',
                role: Role.CLIENT,
            }),
        ).toBeNull();
        expect(
            toCabinetSubject({ sub: 'user:0', login: 'x', role: Role.CLIENT }),
        ).toBeNull();
    });

    it('сессия маркетплейс/локального приложения: портал по id и member_id', () => {
        expect(
            toCabinetSubject({
                sub: 'member-1',
                login: 'bx-user:5@member-1',
                role: Role.CLIENT,
                portalId: 12,
                memberId: 'member-1',
                bitrixUserId: '5',
                isAdmin: true,
            }),
        ).toEqual({
            kind: 'frame',
            bitrixUserId: '5',
            isAdmin: true,
            portal: { portalId: 12, memberId: 'member-1' },
            login: 'bx-user:5@member-1',
        });
    });

    it('сессия фреймов продуктов: портал по домену', () => {
        const subject = toCabinetSubject({
            sub: 'portal:a.bitrix24.ru:7',
            login: '7@a.bitrix24.ru',
            role: Role.CLIENT,
            domain: 'a.bitrix24.ru',
            bitrixUserId: '7',
        });
        expect(subject).toMatchObject({
            kind: 'frame',
            isAdmin: false,
            portal: { domain: 'a.bitrix24.ru' },
        });
    });

    it('CLIENT без сотрудника и без учётки, SERVICE — не субъекты', () => {
        expect(
            toCabinetSubject({
                sub: 'member-1',
                login: 'x',
                role: Role.CLIENT,
                portalId: 1,
            }),
        ).toBeNull();
        expect(
            toCabinetSubject({ sub: 'bot', login: 'bot', role: Role.SERVICE }),
        ).toBeNull();
    });

    it('фрейм без признаков портала — не субъект', () => {
        expect(
            toCabinetSubject({
                sub: 'x',
                login: 'x',
                role: Role.CLIENT,
                bitrixUserId: '1',
            }),
        ).toBeNull();
    });
});

describe('hasCabinetLevel', () => {
    it('уровни по возрастанию: frame < member < owner < platform', () => {
        expect(hasCabinetLevel('platform', 'owner')).toBe(true);
        expect(hasCabinetLevel('owner', 'owner')).toBe(true);
        expect(hasCabinetLevel('member', 'owner')).toBe(false);
        expect(hasCabinetLevel('frame', 'member')).toBe(false);
        expect(hasCabinetLevel('member', 'frame')).toBe(true);
    });
});
