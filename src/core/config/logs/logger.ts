import * as winston from 'winston';

export const winstonLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, context, timestamp }) => {
      return `[${timestamp}] [${context ?? 'App'}] ${level.toUpperCase()}: ${message}`;
    }),
  ),
  transports: [new winston.transports.Console()],
});
// asd
// export const winstonLogger = winston.createLogger({
//   level: 'info',
//   format: winston.format.combine(
//     winston.format.timestamp(),
//     winston.format.errors({ stack: true }),
//     winston.format.json()
//   ),
//   transports: [new winston.transports.Console()],
// });