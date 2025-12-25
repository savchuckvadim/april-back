

const getExpiresAt = (expires_in: number | undefined) => {
    const expiresAt = new Date(
        Date.now() + (expires_in ?? 3600) * 1000,
    )
        .toISOString()
        .replace('T', ' ')
        .replace('Z', '')
        .split('.')[0]; // убираем миллисекунды
    return expiresAt;
};
