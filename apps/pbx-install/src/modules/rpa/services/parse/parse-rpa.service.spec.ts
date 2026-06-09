import * as path from 'path';
import { StorageService } from '@/core/storage';
import { ParseRpaService } from './parse-rpa.service';
import { RpaGroupEnum, RpaNameEnum } from '../../dto/install-rpa.dto';

/**
 * Тест парсера на РЕАЛЬНОМ шаблоне `storage/app/install/general/rpa/supply/data.xlsx`,
 * чтобы зафиксировать раскладку листов и маппинг категории/стадий/полей.
 */
describe('ParseRpaService (real template: supply)', () => {
    let service: ParseRpaService;
    const realPath = path.resolve(
        process.cwd(),
        'storage/app/install/general/rpa/supply/data.xlsx',
    );

    beforeEach(() => {
        const storage = {
            getFilePath: jest.fn().mockReturnValue(realPath),
            fileExistsByType: jest.fn().mockResolvedValue(true),
        } as unknown as StorageService;
        service = new ParseRpaService(storage);
    });

    it('парсит один RPA с одной категорией', async () => {
        const result = await service.getParsedData(
            RpaNameEnum.SUPPLY,
            RpaGroupEnum.GENERAL,
        );
        expect(result).toHaveLength(1);
        const rpa = result[0];
        expect(rpa.code).toBe('supply');
        expect(rpa.entityTypeId).toBe('158');
        expect(rpa.categories).toHaveLength(1);
    });

    it('парсит стадии единственной категории с семантикой', async () => {
        const [rpa] = await service.getParsedData(
            RpaNameEnum.SUPPLY,
            RpaGroupEnum.GENERAL,
        );
        const stages = rpa.categories[0].stages;
        expect(stages.length).toBeGreaterThan(0);

        const newStage = stages.find(s => s.code === 'rpa_supply_new');
        expect(newStage).toBeDefined();
        expect(newStage?.isFirst).toBe(true);

        const success = stages.find(s => s.code === 'rpa_supply_success');
        expect(success?.semantic.toUpperCase()).toBe('SUCCESS');
        expect(success?.isSuccess).toBe(true);

        const fail = stages.find(s => s.code === 'rpa_supply_fail');
        expect(fail?.isFail).toBe(true);
    });

    it('парсит поля RPA (берёт суффикс из колонки «Смарт»)', async () => {
        const [rpa] = await service.getParsedData(
            RpaNameEnum.SUPPLY,
            RpaGroupEnum.GENERAL,
        );
        expect(rpa.fields.length).toBeGreaterThan(0);
        // Все поля должны иметь непустой bxFieldName-суффикс.
        expect(rpa.fields.every(f => f.bxFieldName.length > 0)).toBe(true);

        const saleDate = rpa.fields.find(f => f.code === 'sale_date');
        expect(saleDate).toBeDefined();
        expect(saleDate?.bxFieldName).toBe('SALE_DATE');

        const enumField = rpa.fields.find(f => f.type === 'enumeration');
        expect(enumField?.list.length).toBeGreaterThan(0);
    });

    it('бросает 404, если шаблон не найден', async () => {
        const storage = {
            getFilePath: jest.fn().mockReturnValue(realPath),
            fileExistsByType: jest.fn().mockResolvedValue(false),
        } as unknown as StorageService;
        const s = new ParseRpaService(storage);
        await expect(
            s.getParsedData(RpaNameEnum.SUPPLY, RpaGroupEnum.GENERAL),
        ).rejects.toThrow('RPA template not found');
    });
});
