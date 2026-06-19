import { TelegramService } from '@lib/telegram';
import { Logger } from '@nestjs/common';
import Bull from 'bull';

interface ActualizeDealsFinReportPusherParams {
    telegramService: TelegramService;
    loggerService: Logger;
    callBack: () => Promise<Bull.Job<unknown>>;
    // domain: string;
    message: string;
    name?: string; //просто название действия
    // withTasks?: boolean;
}

export const actualizeDealsFinReportPusher = async (
    params: ActualizeDealsFinReportPusherParams,
) => {
    console.log('actualizeDealsFinReportPusher', params.message);
    const { telegramService, loggerService, message, callBack } = params;
    const now = new Date();
    const timezone = 'Europe/Moscow';
    const date = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    await telegramService.sendMessage(
        `⏰ ${message} ${hours}:${minutes}:${seconds} ${timezone}`,
    );

    try {
        // const withTasks = true; //запускает с назначением задач
        // withTasks=true — ставим задачи-предупреждения; передайте false, чтобы только синхронизировать акты без задач.
        // await this.smartActQueueService.send(domain, withTasks, undefined);
        await callBack();
    } catch (err) {
        await telegramService.sendMessage('SCHEDLER Ошибка');
        loggerService.error('Ошибка в handleDailyTasks', err);
    }
};
