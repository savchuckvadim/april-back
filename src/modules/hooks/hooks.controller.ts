// // modules/hooks/hooks.controller.ts

// import {
//     Controller, Post, Req, Query,
//     InternalServerErrorException, Logger,
//   } from '@nestjs/common';
//   import { Request } from 'express';
//   import { QueueService } from '../queue/queue.service';
//   import { RedisService } from 'src/core/redis/redis.service';
  
//   @Controller('hooks')
//   export class HooksController {
//     private readonly logger = new Logger(HooksController.name);
  
//     constructor(
//       private readonly queueService: QueueService,
//       private readonly redisService: RedisService
//     ) {
//       this.logger.log('HooksController initialized');
//     }
  
//     @Post('activity')
//     async handleActivity(@Req() request: Request, @Query() query: any) {
//       try {
//         // this.logger.log('handleActivity called');
//         const redis = this.redisService.getClient();
//         const id = Date.now();
//         // this.logger.log(`Generated ID: ${id}`);
  
//         const body = request.body;
//         const parsedParams = request.query as Record<string, any>;
//         // this.logger.log(`Request params: ${JSON.stringify(parsedParams)}`);
  
//         const domain = body?.auth?.domain;
//         this.logger.log(`Domain: ${domain}`);
  
//         const key = 'GO_alfa';
//         const lockKey = 'GO_alfa_lock';
//         const ttlMs = 1500;
//         const redisRaw = await redis.get(key);
//         const current = redisRaw ? JSON.parse(redisRaw) : {};
//         const { companyId, title, date, responsible } = parsedParams;
  
//         current[id] = {
//           companyId: Number(companyId),
//           title,
//           date,
//           responsible,
//         };
//         this.logger.log(`Current data: ${JSON.stringify(current)}`);
  
//         await redis.set(key, JSON.stringify(current));
//         await redis.set(lockKey, '1', 'PX', ttlMs);
//         this.logger.log('Data saved to Redis');
  
//         const queueKey = 'GO_alfa_job_started';
//         const taskExists = await redis.get(queueKey);
//         this.logger.log(`Task exists: ${!!taskExists}`);
  
//         if (!taskExists) {
//           await redis.set(queueKey, '1', 'EX', 10);
//           this.logger.log('Adding activity job to queue');
//           await this.queueService.addActivityJob({ domain });
//           this.logger.log('Activity job added to queue');
//         }
  
//         return { result: true };
//       } catch (error) {
//         this.logger.error('Error in handleActivity');
//         this.logger.error(`Error message: ${error.message}`);
//         this.logger.error(`Stack trace: ${error.stack}`);
  
//         throw new InternalServerErrorException('Ошибка в контроллере handleActivity');
//       }
//     }
//   }
  
  
  
