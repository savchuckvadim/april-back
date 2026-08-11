import { BadRequestException } from '@nestjs/common';
import { ConstSmartInstallerResolver } from '../services/const-smart-installer.service';

describe('ConstSmartInstallerResolver', () => {
    const makeResolver = () => {
        const aicall = {
            execute: jest.fn().mockResolvedValue({
                entityTypeId: 128,
                created: false,
                fieldsAdded: [],
                fieldsExisting: ['UF_CRM_128_SUMMARY'],
                fieldsFailed: [],
            }),
        };
        const skap = {
            execute: jest.fn().mockResolvedValue({
                entityTypeId: 156,
                created: true,
                fieldsAdded: ['UF_CRM_130_LOGIN'],
                fieldsExisting: [],
                fieldsFailed: [],
            }),
        };
        const resolver = new ConstSmartInstallerResolver(
            aicall as never,
            skap as never,
        );
        return { resolver, aicall, skap };
    };

    it('resolve(aicall) проксирует execute(domain)', async () => {
        const { resolver, aicall } = makeResolver();
        const result = await resolver
            .resolve('aicall')
            .execute('gsr.bitrix24.ru');
        expect(aicall.execute).toHaveBeenCalledWith('gsr.bitrix24.ru');
        expect(result.entityTypeId).toBe(128);
    });

    it('resolve(skap) проксирует execute(domain)', async () => {
        const { resolver, skap } = makeResolver();
        const result = await resolver
            .resolve('skap')
            .execute('april.bitrix24.ru');
        expect(skap.execute).toHaveBeenCalledWith('april.bitrix24.ru');
        expect(result.created).toBe(true);
    });

    it('неизвестный kind — BadRequest со списком доступных', () => {
        const { resolver } = makeResolver();
        expect(() => resolver.resolve('unknown')).toThrow(BadRequestException);
        expect(() => resolver.resolve('unknown')).toThrow('aicall');
    });
});
