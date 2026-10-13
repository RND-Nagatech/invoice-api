type Environment = Record<string, string | number>;

export function validateEnvironment(raw: Record<string, unknown>): Environment {
  const required = (name: string): string => {
    const value = raw[name];
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`${name} is required`);
    }
    return value.trim();
  };

  const port = Number(raw.PORT ?? 3000);
  const redisPort = Number(raw.REDIS_PORT ?? 6379);
  const passwordResetOtpTtlMinutes = Number(
    raw.PASSWORD_RESET_OTP_TTL_MINUTES ?? 5,
  );
  const aiFreeVoiceTrialLimit = Number(raw.AI_FREE_VOICE_TRIAL_LIMIT ?? 3);
  if (
    !Number.isInteger(aiFreeVoiceTrialLimit) ||
    aiFreeVoiceTrialLimit < 0 ||
    aiFreeVoiceTrialLimit > 100
  )
    throw new Error(
      'AI_FREE_VOICE_TRIAL_LIMIT must be an integer between 0 and 100',
    );
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid TCP port');
  }
  if (!Number.isInteger(redisPort) || redisPort < 1 || redisPort > 65535) {
    throw new Error('REDIS_PORT must be a valid TCP port');
  }
  if (
    !Number.isInteger(passwordResetOtpTtlMinutes) ||
    passwordResetOtpTtlMinutes < 1 ||
    passwordResetOtpTtlMinutes > 60
  ) {
    throw new Error(
      'PASSWORD_RESET_OTP_TTL_MINUTES must be an integer between 1 and 60',
    );
  }
  const accessSecret = required('JWT_ACCESS_SECRET');
  const refreshSecret = required('JWT_REFRESH_SECRET');
  if (accessSecret.length < 32 || refreshSecret.length < 32) {
    throw new Error('JWT secrets must be at least 32 characters');
  }
  if (
    accessSecret.startsWith('replace-with-') ||
    refreshSecret.startsWith('replace-with-')
  ) {
    throw new Error('Replace the example JWT secrets before starting the API');
  }
  if (accessSecret === refreshSecret) {
    throw new Error('JWT access and refresh secrets must differ');
  }
  const publicInvoiceBaseUrl =
    typeof raw.PUBLIC_INVOICE_BASE_URL === 'string'
      ? raw.PUBLIC_INVOICE_BASE_URL.trim()
      : 'http://localhost:3000/api/v1/public/invoices';
  const singapayTimeoutMs = Number(raw.SINGAPAY_TIMEOUT_MS ?? 30_000);
  if (
    !Number.isInteger(singapayTimeoutMs) ||
    singapayTimeoutMs < 1_000 ||
    singapayTimeoutMs > 120_000
  ) {
    throw new Error(
      'SINGAPAY_TIMEOUT_MS must be an integer between 1000 and 120000',
    );
  }
  try {
    new URL(publicInvoiceBaseUrl);
  } catch {
    throw new Error('PUBLIC_INVOICE_BASE_URL must be a valid URL');
  }

  const resendApiKey =
    typeof raw.RESEND_API_KEY === 'string' ? raw.RESEND_API_KEY.trim() : '';
  const resendFromEmail =
    typeof raw.RESEND_FROM_EMAIL === 'string' &&
    raw.RESEND_FROM_EMAIL.trim().length > 0
      ? raw.RESEND_FROM_EMAIL.trim()
      : 'InvoiceKilat <no-reply@example.com>';
  const resendTestRecipient =
    typeof raw.RESEND_TEST_RECIPIENT === 'string'
      ? raw.RESEND_TEST_RECIPIENT.trim()
      : '';
  if (raw.NODE_ENV === 'production' && !resendApiKey) {
    throw new Error('RESEND_API_KEY is required in production');
  }
  if (
    raw.NODE_ENV === 'production' &&
    resendFromEmail === 'InvoiceKilat <no-reply@example.com>'
  ) {
    throw new Error('RESEND_FROM_EMAIL is required in production');
  }
  if (raw.NODE_ENV === 'production' && resendTestRecipient) {
    throw new Error('RESEND_TEST_RECIPIENT is only allowed outside production');
  }
  if (
    raw.NODE_ENV === 'production' &&
    resendFromEmail.toLowerCase().includes('@resend.dev')
  ) {
    throw new Error(
      'Use a verified custom domain for RESEND_FROM_EMAIL in production',
    );
  }

  const billingMode =
    typeof raw.SUBSCRIPTION_PAYMENT_MODE === 'string'
      ? raw.SUBSCRIPTION_PAYMENT_MODE
      : 'demo';
  if (!['demo', 'manual'].includes(billingMode))
    throw new Error('SUBSCRIPTION_PAYMENT_MODE must be demo or manual');
  const proPrice = Number(raw.SUBSCRIPTION_PRO_PRICE ?? 129000);
  if (!Number.isSafeInteger(proPrice) || proPrice < 1)
    throw new Error('SUBSCRIPTION_PRO_PRICE must be a positive integer');
  const reviewEmail =
    typeof raw.BILLING_REVIEW_EMAIL === 'string'
      ? raw.BILLING_REVIEW_EMAIL.trim().toLowerCase()
      : '';
  if (reviewEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reviewEmail))
    throw new Error('BILLING_REVIEW_EMAIL must be a valid email');
  const adminPassword =
    typeof raw.BILLING_ADMIN_PASSWORD === 'string'
      ? raw.BILLING_ADMIN_PASSWORD
      : '';
  if (adminPassword && adminPassword.length < 16)
    throw new Error('BILLING_ADMIN_PASSWORD must be at least 16 characters');
  const billingBaseUrl =
    typeof raw.BILLING_PUBLIC_BASE_URL === 'string'
      ? raw.BILLING_PUBLIC_BASE_URL.trim()
      : 'http://localhost:' + port + '/api/v1/subscriptions';
  const billingUrl = new URL(billingBaseUrl);
  if (!['http:', 'https:'].includes(billingUrl.protocol))
    throw new Error('BILLING_PUBLIC_BASE_URL must use HTTP(S)');
  if (raw.NODE_ENV === 'production') {
    if (billingMode === 'demo')
      throw new Error(
        'Use manual billing in production; demo is for development only',
      );
    if (!reviewEmail || !adminPassword || billingUrl.protocol !== 'https:')
      throw new Error(
        'Production billing requires reviewer email, admin password, and a public HTTPS URL',
      );
  }

  return {
    ...Object.fromEntries(
      Object.entries(raw).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    ),
    PORT: port,
    SUBSCRIPTION_PAYMENT_MODE: billingMode,
    SUBSCRIPTION_PRO_PRICE: proPrice,
    BILLING_REVIEW_EMAIL: reviewEmail,
    BILLING_ADMIN_PASSWORD: adminPassword,
    BILLING_PUBLIC_BASE_URL: billingBaseUrl,
    MONGODB_URI: required('MONGODB_URI'),
    REDIS_HOST: required('REDIS_HOST'),
    REDIS_PORT: redisPort,
    PASSWORD_RESET_OTP_TTL_MINUTES: passwordResetOtpTtlMinutes,
    AI_FREE_VOICE_TRIAL_LIMIT: aiFreeVoiceTrialLimit,
    RESEND_API_KEY: resendApiKey,
    RESEND_FROM_EMAIL: resendFromEmail,
    RESEND_TEST_RECIPIENT: resendTestRecipient,
    PUBLIC_INVOICE_BASE_URL: publicInvoiceBaseUrl,
    PAYMENT_WEBHOOK_SECRET:
      typeof raw.PAYMENT_WEBHOOK_SECRET === 'string' &&
      raw.PAYMENT_WEBHOOK_SECRET.trim().length > 0
        ? raw.PAYMENT_WEBHOOK_SECRET.trim()
        : 'development-payment-webhook-secret',
    SINGAPAY_ENABLED: raw.SINGAPAY_ENABLED === 'true' ? 'true' : 'false',
    SINGAPAY_ENVIRONMENT:
      raw.SINGAPAY_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
    SINGAPAY_AUTH_VERSION: raw.SINGAPAY_AUTH_VERSION === '1.0' ? '1.0' : '1.1',
    SINGAPAY_TIMEOUT_MS: singapayTimeoutMs,
    SINGAPAY_WEBHOOK_PATH:
      typeof raw.SINGAPAY_WEBHOOK_PATH === 'string' &&
      raw.SINGAPAY_WEBHOOK_PATH.trim().length > 0
        ? raw.SINGAPAY_WEBHOOK_PATH.trim()
        : '/api/v1/payments/webhook/singapay',
    JWT_ACCESS_SECRET: accessSecret,
    JWT_REFRESH_SECRET: refreshSecret,
    CORS_ORIGINS:
      typeof raw.CORS_ORIGINS === 'string'
        ? raw.CORS_ORIGINS
        : 'http://localhost:3000',
  };
}
