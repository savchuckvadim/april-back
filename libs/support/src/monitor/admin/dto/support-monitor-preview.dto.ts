import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
import type { SupportMonitorRunReport } from '../../application/support-monitor.report';
import {
    SupportDialogReportDto,
    SupportSignalReportDto,
} from '../../dto/support-report.dto';

export class SupportMonitorPreviewRequestDto {
    @ApiProperty({
        description:
            'Адрес портала, где живёт открытая линия поддержки. Настройки ' +
            'монитора берутся из блока «Портал (общие)» этого портала.',
        type: String,
        example: 'april-dev.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    @Matches(/^[a-z0-9.-]+$/i, {
        message: 'domain — адрес портала без протокола и пути',
    })
    domain: string;
}

export class SupportMonitorPreviewResponseDto
    implements SupportMonitorRunReport
{
    @ApiProperty({
        description: 'Портал линии.',
        type: String,
        example: 'april-dev.bitrix24.ru',
    })
    domain: string;

    @ApiProperty({
        description:
            'Монитор в режиме «только считать»: предпросмотр сверяется с памятью ' +
            'пробного прогона, а не боевой.',
        type: Boolean,
        example: true,
    })
    dryRun: boolean;

    @ApiProperty({
        description: 'Открытые диалоги линии: кто, сколько ждёт, где открыть.',
        type: [SupportDialogReportDto],
    })
    dialogs: SupportDialogReportDto[];

    @ApiProperty({
        description:
            'Оповещения, которые крон отправил бы прямо сейчас. Ничего не отправлено.',
        type: [SupportSignalReportDto],
    })
    signals: SupportSignalReportDto[];

    @ApiProperty({
        description: 'Что прочитать не удалось или что мешает рассылке.',
        type: [String],
        example: [],
    })
    warnings: string[];
}
