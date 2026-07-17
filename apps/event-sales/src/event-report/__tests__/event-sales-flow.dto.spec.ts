import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
    ContactDto,
    ContactMultifieldDto,
} from '../dto/event-sale-flow/contact.dto';
import { ReturnToTmcDto } from '../dto/event-sale-flow/event-sales-flow.dto';

describe('ContactDto', () => {
    it('валиден при полностью пустом контакте (нет даже ID и имени)', async () => {
        const dto = plainToInstance(ContactDto, {});
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });

    it('валиден, если у телефона нет TYPE', async () => {
        const dto = plainToInstance(ContactDto, {
            PHONE: [{ VALUE: '+79991234567' }],
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });

    it('валиден, если у email нет TYPE и VALUE', async () => {
        const dto = plainToInstance(ContactDto, {
            EMAIL: [{}],
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });

    it('невалиден, если TYPE телефона не строка', async () => {
        const dto = plainToInstance(ContactMultifieldDto, { TYPE: 123 });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
    });
});

describe('ReturnToTmcDto', () => {
    it('валиден, когда data — объект TmcDealsForReturn (legacy-контракт)', async () => {
        const dto = plainToInstance(ReturnToTmcDto, {
            data: {
                taskId: 1024,
                tmcDeal: { ID: '77', TITLE: 'ТМЦ сделка' },
            },
            isActive: true,
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });

    it('валиден, когда data — falsy-значение legacy-фронта (false)', async () => {
        const dto = plainToInstance(ReturnToTmcDto, {
            data: false,
            isActive: false,
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });

    it('валиден при полностью пустом объекте', async () => {
        const dto = plainToInstance(ReturnToTmcDto, {});
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });

    it('невалиден, если isActive не boolean', async () => {
        const dto = plainToInstance(ReturnToTmcDto, { isActive: 'yes' });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
    });
});
