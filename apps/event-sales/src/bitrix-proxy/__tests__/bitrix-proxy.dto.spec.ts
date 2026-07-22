import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BitrixProxyCallDto } from '../dto/bitrix-proxy.dto';

describe('BitrixProxyCallDto', () => {
    const validateDto = async (plain: Record<string, unknown>) => {
        const dto = plainToInstance(BitrixProxyCallDto, plain);

        return validate(dto);
    };

    it('валидный метод с параметрами проходит валидацию', async () => {
        const errors = await validateDto({
            method: 'crm.deal.get',
            params: { id: 1 },
        });

        expect(errors).toHaveLength(0);
    });

    it('метод без params проходит валидацию (params опциональны)', async () => {
        const errors = await validateDto({ method: 'user.current' });

        expect(errors).toHaveLength(0);
    });

    it('пустой method отклоняется', async () => {
        const errors = await validateDto({ method: '' });

        expect(errors.length).toBeGreaterThan(0);
    });

    it('method с недопустимыми символами отклоняется', async () => {
        const errors = await validateDto({
            method: 'crm.deal.get?admin=1',
        });

        expect(errors.length).toBeGreaterThan(0);
    });

    it('params не-объект отклоняется', async () => {
        const errors = await validateDto({
            method: 'crm.deal.get',
            params: 'id=1',
        });

        expect(errors.length).toBeGreaterThan(0);
    });
});
