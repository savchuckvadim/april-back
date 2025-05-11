

export const cors = {
    origin: (process.env.CORS_ORIGIN ?? '')
        .split(',')
        .map(origin => origin.trim()),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],

    credentials: true,
}