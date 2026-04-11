export const jwtConstants = {
    accessSecret:
        process.env.ACCESS_TOKEN_SECRET ||
        process.env.APP_SECRET_KEY ||
        'super-secret-access',
    refreshSecret:
        process.env.REFRESH_TOKEN_SECRET ||
        process.env.APP_SECRET_KEY ||
        'super-secret-refresh',
    accessExpiresIn: (process.env.ACCESS_TOKEN_TTL ||
        '15m') as `${number}${'s' | 'm' | 'h' | 'd'}`,
    refreshExpiresIn: (process.env.REFRESH_TOKEN_TTL ||
        '7d') as `${number}${'s' | 'm' | 'h' | 'd'}`,
    refreshTtlDays: 7,
};
