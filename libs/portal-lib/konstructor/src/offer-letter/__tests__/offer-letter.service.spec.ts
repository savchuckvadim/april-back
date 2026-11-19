import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
    CreateOfferLetterInput,
    OfferLetterService,
} from '../offer-letter.service';
import { MemoryOfferLetterRepository } from './memory-offer-letter.repository';

const PORTAL = 1;
const OTHER_PORTAL = 2;
const MANAGER = 1480;

const setup = () => {
    const repository = new MemoryOfferLetterRepository(
        [],
        [PORTAL, OTHER_PORTAL],
    );
    const service = new OfferLetterService(repository);
    return { repository, service };
};

const input = (
    overrides: Partial<CreateOfferLetterInput> = {},
): CreateOfferLetterInput => ({
    portalId: PORTAL,
    name: 'Письмо',
    text: 'Добрый день!',
    ...overrides,
});

/** id писем области, у которых стоит «по умолчанию» */
const defaultIds = (
    repository: MemoryOfferLetterRepository,
    portalId: number,
    bxUserId: number | null,
): string[] =>
    repository.rows
        .filter(
            row =>
                row.portalId === portalId &&
                row.bxUserId === bxUserId &&
                row.isDefault,
        )
        .map(row => row.id);

describe('письма КП: письмо по умолчанию', () => {
    it('первое активное письмо портала становится письмом по умолчанию само', async () => {
        const { service } = setup();
        const first = await service.create(input());
        expect(first.isDefault).toBe(true);
    });

    it('второе письмо по умолчанию не становится, пока его не попросили', async () => {
        const { service, repository } = setup();
        const first = await service.create(input());
        const second = await service.create(input({ name: 'Второе' }));
        expect(second.isDefault).toBe(false);
        expect(defaultIds(repository, PORTAL, null)).toEqual([first.id]);
    });

    it('создание с isDefault забирает статус у прежнего письма', async () => {
        const { service, repository } = setup();
        await service.create(input());
        const second = await service.create(
            input({ name: 'Второе', isDefault: true }),
        );
        expect(second.isDefault).toBe(true);
        expect(defaultIds(repository, PORTAL, null)).toEqual([second.id]);
    });

    it('setDefault переносит статус: у области по умолчанию ровно одно письмо', async () => {
        const { service, repository } = setup();
        await service.create(input());
        const second = await service.create(input({ name: 'Второе' }));
        const third = await service.create(input({ name: 'Третье' }));

        const result = await service.setDefault(third.id);

        expect(result.isDefault).toBe(true);
        expect(defaultIds(repository, PORTAL, null)).toEqual([third.id]);
        expect((await service.get(second.id)).isDefault).toBe(false);
    });

    it('письма портала и личные письма менеджера не мешают друг другу', async () => {
        const { service, repository } = setup();
        const portalLetter = await service.create(input());
        const personal = await service.create(input({ bxUserId: MANAGER }));
        const otherPortal = await service.create(
            input({ portalId: OTHER_PORTAL }),
        );

        expect(personal.isDefault).toBe(true);
        expect(otherPortal.isDefault).toBe(true);
        expect(defaultIds(repository, PORTAL, null)).toEqual([portalLetter.id]);
        expect(defaultIds(repository, PORTAL, MANAGER)).toEqual([personal.id]);

        await service.setDefault(
            (
                await service.create(
                    input({ name: 'Ещё личное', bxUserId: MANAGER }),
                )
            ).id,
        );
        expect(defaultIds(repository, PORTAL, null)).toEqual([portalLetter.id]);
        expect(defaultIds(repository, PORTAL, MANAGER)).toHaveLength(1);
    });

    it('неактивное письмо не становится письмом по умолчанию при создании', async () => {
        const { service } = setup();
        await expect(
            service.create(input({ isActive: false, isDefault: true })),
        ).rejects.toThrow(BadRequestException);
    });

    it('неактивное письмо нельзя назначить письмом по умолчанию', async () => {
        const { service } = setup();
        await service.create(input());
        const inactive = await service.create(
            input({ name: 'Выключенное', isActive: false }),
        );
        await expect(service.setDefault(inactive.id)).rejects.toThrow(
            BadRequestException,
        );
    });

    it('первое письмо области, созданное неактивным, по умолчанию не становится', async () => {
        const { service } = setup();
        const created = await service.create(input({ isActive: false }));
        expect(created.isDefault).toBe(false);
    });

    it('выключение письма по умолчанию отдаёт статус следующему активному по sort', async () => {
        const { service, repository } = setup();
        const first = await service.create(input({ sort: 0 }));
        await service.create(input({ name: 'Дальнее', sort: 30 }));
        const near = await service.create(input({ name: 'Ближнее', sort: 10 }));

        const updated = await service.update(first.id, { isActive: false });

        expect(updated.isDefault).toBe(false);
        expect(defaultIds(repository, PORTAL, null)).toEqual([near.id]);
    });

    it('выключение единственного активного письма оставляет область без письма по умолчанию', async () => {
        const { service, repository } = setup();
        const only = await service.create(input());
        const updated = await service.update(only.id, { isActive: false });
        expect(updated.isDefault).toBe(false);
        expect(defaultIds(repository, PORTAL, null)).toEqual([]);
    });

    it('включение письма в области без письма по умолчанию делает его письмом по умолчанию', async () => {
        const { service } = setup();
        const only = await service.create(input({ isActive: false }));
        const updated = await service.update(only.id, { isActive: true });
        expect(updated.isDefault).toBe(true);
    });

    it('удаление письма по умолчанию отдаёт статус следующему активному', async () => {
        const { service, repository } = setup();
        const first = await service.create(input());
        await service.create(
            input({ name: 'Выключенное', isActive: false, sort: 1 }),
        );
        const next = await service.create(input({ name: 'Рабочее', sort: 2 }));

        await service.remove(first.id);

        expect(defaultIds(repository, PORTAL, null)).toEqual([next.id]);
    });

    it('удаление последнего письма не оставляет следов', async () => {
        const { service, repository } = setup();
        const only = await service.create(input());
        await service.remove(only.id);
        expect(repository.rows).toEqual([]);
    });

    it('область с двумя письмами по умолчанию (старые данные) чинится при записи', async () => {
        const { service, repository } = setup();
        const first = await service.create(input({ sort: 5 }));
        const second = await service.create(input({ name: 'Второе', sort: 1 }));
        repository.rows.forEach(row => {
            row.isDefault = true;
        });

        await service.update(first.id, { name: 'Первое' });

        expect(defaultIds(repository, PORTAL, null)).toEqual([second.id]);
    });
});

describe('письма КП: проверка данных', () => {
    it('пустое и пробельное название отклоняется', async () => {
        const { service } = setup();
        await expect(service.create(input({ name: '   ' }))).rejects.toThrow(
            'Название письма не заполнено',
        );
    });

    it('слишком длинное название отклоняется', async () => {
        const { service } = setup();
        await expect(
            service.create(input({ name: 'я'.repeat(256) })),
        ).rejects.toThrow(BadRequestException);
    });

    it('пустой и слишком длинный текст отклоняются', async () => {
        const { service } = setup();
        await expect(service.create(input({ text: ' \n ' }))).rejects.toThrow(
            'Текст письма не заполнен',
        );
        await expect(
            service.create(input({ text: 'я'.repeat(5001) })),
        ).rejects.toThrow(BadRequestException);
    });

    it('название и текст сохраняются без лишних пробелов по краям', async () => {
        const { service } = setup();
        const created = await service.create(
            input({ name: '  Письмо  ', text: '\n Добрый день! \n' }),
        );
        expect(created.name).toBe('Письмо');
        expect(created.text).toBe('Добрый день!');
    });

    it('незакрытый, лишний закрывающий и пересекающиеся теги отклоняются', async () => {
        const { service } = setup();
        await expect(
            service.create(input({ text: 'Раз <color>два' })),
        ).rejects.toThrow('Не закрыт тег <color>');
        await expect(
            service.create(input({ text: 'Раз</red> два' })),
        ).rejects.toThrow('Лишний закрывающий тег </red>');
        await expect(
            service.create(
                input({ text: '<bold>раз <red>два</bold> три</red>' }),
            ),
        ).rejects.toThrow('теги не должны пересекаться');
    });

    it('неизвестные теги отклоняются с перечнем допустимых', async () => {
        const { service } = setup();
        await expect(
            service.create(input({ text: 'Раз <b>два</b>' })),
        ).rejects.toThrow(
            'Тег <b> не поддерживается. Доступны: <color>, <bold>, <red>.',
        );
    });

    it('поддерживаемая разметка принимается, в том числе вложенная', async () => {
        const { service } = setup();
        const created = await service.create(
            input({
                text: '<color>ГАРАНТ</color> и <bold>жирный <red>красный</red></bold>\nВторой абзац',
            }),
        );
        expect(created.text).toContain(
            '<bold>жирный <red>красный</red></bold>',
        );
    });

    it('знаки «меньше/больше» в обычном тексте не считаются тегами', async () => {
        const { service } = setup();
        await expect(
            service.create(
                input({
                    text: 'Скидка при заказе > 5 лицензий, срок < 3 дней',
                }),
            ),
        ).resolves.toBeDefined();
    });

    it('неверный портал и менеджер отклоняются, несуществующий портал — 404', async () => {
        const { service } = setup();
        await expect(service.create(input({ portalId: 0 }))).rejects.toThrow(
            BadRequestException,
        );
        await expect(service.create(input({ bxUserId: 0 }))).rejects.toThrow(
            BadRequestException,
        );
        await expect(service.create(input({ portalId: 99 }))).rejects.toThrow(
            NotFoundException,
        );
    });

    it('правка проверяет те же правила, что и создание', async () => {
        const { service } = setup();
        const created = await service.create(input());
        await expect(service.update(created.id, { name: ' ' })).rejects.toThrow(
            BadRequestException,
        );
        await expect(
            service.update(created.id, { text: '<red>без конца' }),
        ).rejects.toThrow(BadRequestException);
    });

    it('правка без полей ничего не меняет', async () => {
        const { service, repository } = setup();
        const created = await service.create(input());
        const result = await service.update(created.id, {});
        expect(result).toEqual(created);
        expect(repository.rows).toHaveLength(1);
    });

    it('правка меняет только переданные поля и не трогает область', async () => {
        const { service } = setup();
        const created = await service.create(input({ bxUserId: MANAGER }));
        const updated = await service.update(created.id, {
            name: 'Новое',
            sort: 7,
        });
        expect(updated).toMatchObject({
            name: 'Новое',
            sort: 7,
            text: created.text,
            portalId: PORTAL,
            bxUserId: MANAGER,
        });
    });

    it('несуществующее письмо — 404 на чтении, правке, назначении и удалении', async () => {
        const { service } = setup();
        await expect(service.get('нет')).rejects.toThrow(NotFoundException);
        await expect(service.update('нет', { name: 'x' })).rejects.toThrow(
            NotFoundException,
        );
        await expect(service.setDefault('нет')).rejects.toThrow(
            NotFoundException,
        );
        await expect(service.remove('нет')).rejects.toThrow(NotFoundException);
    });
});
