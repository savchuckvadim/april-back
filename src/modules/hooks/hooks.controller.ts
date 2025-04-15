// modules/hooks/hooks.controller.ts

import {
  Controller, Post, Req, Query,
  InternalServerErrorException,
} from '@nestjs/common';
import { Request } from 'express';
import { QueueService } from '../queue/queue.service';
import { RedisService } from 'src/core/redis/redis.service';



@Controller('hooks')
export class HooksController {
  constructor(private readonly queueService: QueueService, private readonly redisService: RedisService) { }

  @Post('activity')
  async handleActivity(@Req() request: Request, @Query() query: any) {
    try {
      console.log('[HOOK] handleActivity called');
      const redis = this.redisService.getClient();
      const id = Date.now(); // или nanoid, или uuid
      console.log(id);
      const body = request.body;
      const parsedParams = request.query as Record<string, any>; // запрос будет приходить с параметрами в query
      console.log(parsedParams);

      const domain = body?.auth?.domain;


      const key = 'GO_alfa';
      const lockKey = 'GO_alfa_lock';
      const ttlMs = 1500;      // сколько ждём "тишины"
      const redisRaw = await redis.get(key);
      const current = redisRaw ? JSON.parse(redisRaw) : {};
      const { companyId, title, date, responsible } = parsedParams;



      current[id] = {
        companyId: Number(companyId),
        title,
        date,
        responsible,
      };
      await redis.set(key, JSON.stringify(current));
      // Установим "флаг тишины" с TTL 1500ms
      await redis.set(lockKey, '1', 'PX', ttlMs);

      // проверяем — была ли уже задача?
      const queueKey = 'GO_alfa_job_started';
      const taskExists = await redis.get(queueKey);
      // const taskExists = await redis.exists(lockKey);

      if (!taskExists) {
        // console.log('[HOOK] ставим задачу в очередь с задержкой');
        // await this.queueService.addActivityJob({
        //   domain,
        // });
        // // Блокируем повторную постановку задачи на N мс
        // await redis.set(lockKey, '1', 'PX', ttlMs);
        // флаг, что задача уже стартовала
        await redis.set(queueKey, '1', 'EX', 10); // 10 сек чтобы не запустить повторно
        console.log('[HOOK] ставим задачу в очередь через 2s...');
        await this.queueService.addActivityJob({ domain });
      }

      return { result: true };

      // ... твоя логика
    } catch (error) {
      console.error('Error in handleActivity', error);

      throw new InternalServerErrorException('Ошибка в контроллере handleActivity');
    }
  }
}
