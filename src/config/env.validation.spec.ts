import { validateEnvironment } from './env.validation.js';

const valid = {
  MONGODB_URI: 'mongodb://localhost:27017/invoicekilat',
  REDIS_HOST: 'localhost',
  RESEND_API_KEY: 're_test_key',
  RESEND_FROM_EMAIL: 'InvoiceKilat <no-reply@example.com>',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('environment validation', () => {
  it('rejects missing or weak JWT secrets', () => {
    expect(() =>
      validateEnvironment({ ...valid, JWT_ACCESS_SECRET: 'short' }),
    ).toThrow('JWT secrets must be at least 32 characters');
  });

  it('parses ports and keeps connection settings', () => {
    const config = validateEnvironment({
      ...valid,
      PORT: '3001',
      REDIS_PORT: '6380',
    });
    expect(config.PORT).toBe(3001);
    expect(config.REDIS_PORT).toBe(6380);
    expect(config.MONGODB_URI).toBe(valid.MONGODB_URI);
  });

  it('parses the configurable password reset OTP duration', () => {
    const config = validateEnvironment({
      ...valid,
      PASSWORD_RESET_OTP_TTL_MINUTES: '12',
    });
    expect(config.PASSWORD_RESET_OTP_TTL_MINUTES).toBe(12);
  });
});
