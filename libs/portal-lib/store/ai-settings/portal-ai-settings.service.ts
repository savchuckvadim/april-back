import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { PortalRepository } from '../portal.repository';
import { PortalAiSettingsRepository } from './portal-ai-settings.repository';
import {
    PortalAiSettingsRecord,
    PortalAiSettingsUpdate,
    PortalAiSettingsWithDomain,
} from './portal-ai-settings.types';

/** Границы часа суток для ночного окна. */
const MIN_HOUR = 0;
const MAX_HOUR = 23;

/**
 * Настройки AI-конвейера на портал: чтение для конвейера и запись из админки.
 *
 * Сервис НЕ подставляет дефолты — отдаёт ровно то, что лежит в БД, вместе с
 * null'ами. Склейку «БД → env → дефолт кода» делает резолвер на стороне
 * приложения, потому что имена env — его специфика, а не общей библиотеки.
 */
@Injectable()
export class PortalAiSettingsService {
    private readonly logger = new Logger(PortalAiSettingsService.name);

    constructor(
        private readonly repository: PortalAiSettingsRepository,
        private readonly portalRepository: PortalRepository,
    ) {}

    /** Настройки портала; null — строки нет, всё берётся из глобальных. */
    async get(portalId: number): Promise<PortalAiSettingsRecord | null> {
        return this.repository.findByPortalId(portalId);
    }

    /** Настройки по домену — путь конвейера, который знает только домен. */
    async getByDomain(domain: string): Promise<PortalAiSettingsRecord | null> {
        return this.repository.findByDomain(domain);
    }

    /** Порталы с явно включённым конвейером — список для планировщика. */
    async findEnabled(): Promise<PortalAiSettingsWithDomain[]> {
        return this.repository.findEnabled();
    }

    /**
     * Сохранение из админки. Поля вне payload не трогаются, явный null
     * сбрасывает значение на глобальное. Домен резолвится по порталу —
     * дубль в строке настроек нужен конвейеру, который знает только домен.
     */
    async save(
        portalId: number,
        update: PortalAiSettingsUpdate,
    ): Promise<PortalAiSettingsRecord> {
        this.assertValid(update);
        const domain = await this.requireDomain(portalId);
        const saved = await this.repository.upsert(portalId, domain, update);
        this.logger.log(
            `Настройки AI портала ${portalId} (${domain}) сохранены: ` +
                `${Object.keys(update).join(', ') || 'без изменений'}`,
        );
        return saved;
    }

    /** Отметка успешного скана — по ней планировщик считает интервал. */
    async markScanned(portalId: number, scannedAt = new Date()): Promise<void> {
        await this.repository.touchLastScan(portalId, scannedAt);
    }

    /** Домен портала; 404, если портала нет — до записи настроек. */
    private async requireDomain(portalId: number): Promise<string> {
        const portal = await this.portalRepository.findById(portalId);
        if (!portal?.domain) {
            throw new NotFoundException(
                `Портал с id=${portalId} не найден или у него не задан домен`,
            );
        }
        return portal.domain;
    }

    /**
     * Проверки, которые дешевле сделать здесь, чем ловить неверное поведение
     * конвейера потом: отрицательные пороги и часы вне суток.
     */
    private assertValid(update: PortalAiSettingsUpdate): void {
        const positives: (keyof PortalAiSettingsUpdate)[] = [
            'minDurationSec',
            'windowHours',
            'maxPerRun',
            'staleMinutes',
            'scanIntervalMinutes',
            'nightScanIntervalMinutes',
        ];
        for (const field of positives) {
            const value = update[field];
            if (typeof value === 'number' && value <= 0) {
                throw new BadRequestException(
                    `Значение «${field}» должно быть больше нуля (передано ${value})`,
                );
            }
        }

        for (const field of ['nightStartHour', 'nightEndHour'] as const) {
            const value = update[field];
            if (
                typeof value === 'number' &&
                (value < MIN_HOUR || value > MAX_HOUR)
            ) {
                throw new BadRequestException(
                    `Значение «${field}» должно быть часом суток ${MIN_HOUR}-${MAX_HOUR} (передано ${value})`,
                );
            }
        }

        // Ночное окно имеет смысл только заданным целиком: с одной границей
        // планировщик не сможет определить, наступила ли ночь.
        const startSet =
            update.nightStartHour !== undefined &&
            update.nightStartHour !== null;
        const endSet =
            update.nightEndHour !== undefined && update.nightEndHour !== null;
        if (startSet !== endSet) {
            throw new BadRequestException(
                'Ночное окно задаётся обеими границами: укажите и начало, и конец, либо очистите обе',
            );
        }
    }
}
