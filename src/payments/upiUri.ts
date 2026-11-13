import QRCode from 'qrcode';

export const DEMO_PLACEHOLDER_VPA = 'sethsawariya@okhdfcbank';

const UPI_VPA_REGEX = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9.-]{2,64}$/;

export function isValidUpiVpa(vpa: string): boolean {
  const trimmed = vpa.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) return false;
  const parts = trimmed.split('@');
  if (parts.length !== 2) return false;
  if (parts[1].startsWith('.') || parts[1].endsWith('.')) return false;
  return UPI_VPA_REGEX.test(trimmed);
}

export function isDemoPlaceholderVpa(vpa?: string | null): boolean {
  const normalized = (vpa ?? '').trim().toLowerCase();
  return !normalized || normalized === DEMO_PLACEHOLDER_VPA;
}

export interface BuildNpciUpiUriInput {
  payeeVpa: string;
  payeeName?: string;
  amountInr: string | number;
  transactionRef?: string;
  note?: string;
}

/**
 * Builds an NPCI-compliant `upi://pay?...` deep link:
 * - Preserves literal `@` in `pa` (some UPI apps reject `%40`)
 * - Uses RFC 3986 `%20` encoding instead of `+` for `pn` and `tn`
 * - Restricts `tr` to max 35 alphanumeric characters
 */
export function buildNpciUpiUri(input: BuildNpciUpiUriInput): string {
  const pa = input.payeeVpa.trim();
  if (!isValidUpiVpa(pa)) {
    throw new Error(`Invalid UPI ID "${pa}". Enter a valid VPA like name@bank.`);
  }

  const parsedAmount =
    typeof input.amountInr === 'number' ? input.amountInr : Number.parseFloat(input.amountInr);
  const am = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount.toFixed(2) : '1.00';

  const cleanName = (input.payeeName || 'Seth Sawariya Cafe')
    .replace(/[^\w\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50) || 'Cafe';

  const cleanRef = (input.transactionRef || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 35);

  const cleanNote = (input.note || 'Cafe Order')
    .replace(/[#&=+?%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50) || 'Cafe Order';

  const pairs: string[] = [
    `pa=${pa}`,
    `pn=${encodeURIComponent(cleanName)}`,
    `am=${am}`,
    'cu=INR',
  ];

  if (cleanRef) {
    pairs.push(`tr=${encodeURIComponent(cleanRef)}`);
  }
  pairs.push(`tn=${encodeURIComponent(cleanNote)}`);

  return `upi://pay?${pairs.join('&')}`;
}

export type UpiAppId = 'any' | 'paytm' | 'gpay' | 'phonepe' | 'amazonpay';

export interface UpiAppOption {
  id: UpiAppId;
  label: string;
  shortLabel: string;
  tagline: string;
  badgeText: string;
  accentClass: string;
  schemePrefix: string;
  androidPackage?: string;
}

export const UPI_APP_OPTIONS: UpiAppOption[] = [
  {
    id: 'gpay',
    label: 'Google Pay',
    shortLabel: 'GPay',
    tagline: 'Instant approval via Tez / GPay',
    badgeText: 'GPay',
    accentClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
    schemePrefix: 'tez://upi/pay',
    androidPackage: 'com.google.android.apps.nbu.paisa.user',
  },
  {
    id: 'paytm',
    label: 'Paytm UPI',
    shortLabel: 'Paytm',
    tagline: 'Paytm UPI, Bank & Wallet balance',
    badgeText: 'Paytm',
    accentClass: 'bg-[#00baf2]/15 text-[#38bdf8] border-[#00baf2]/35',
    schemePrefix: 'paytmmp://pay',
    androidPackage: 'net.one97.paytm',
  },
  {
    id: 'amazonpay',
    label: 'Amazon Pay',
    shortLabel: 'Amazon Pay',
    tagline: 'Amazon Pay UPI & rewards eligible',
    badgeText: 'Amzn',
    accentClass: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
    schemePrefix: 'upi://pay',
    androidPackage: 'in.amazon.mShop.android.shopping',
  },
  {
    id: 'phonepe',
    label: 'PhonePe',
    shortLabel: 'PhonePe',
    tagline: 'Fast PhonePe UPI & Switch',
    badgeText: 'PhonePe',
    accentClass: 'bg-purple-500/15 text-purple-300 border-purple-500/35',
    schemePrefix: 'phonepe://pay',
    androidPackage: 'com.phonepe.app',
  },
  {
    id: 'any',
    label: 'Other UPI / QR',
    shortLabel: 'Any UPI',
    tagline: 'BHIM, CRED, WhatsApp & Dynamic QR',
    badgeText: 'UPI',
    accentClass: 'bg-surface-container-highest text-primary border-primary/35',
    schemePrefix: 'upi://pay',
  },
];

export function getUpiAppOption(appId?: UpiAppId): UpiAppOption {
  return (
    UPI_APP_OPTIONS.find((opt) => opt.id === appId) ??
    UPI_APP_OPTIONS[UPI_APP_OPTIONS.length - 1]
  );
}

export function getUpiAppLabel(appId?: UpiAppId): string {
  return UPI_APP_OPTIONS.find((opt) => opt.id === appId)?.label ?? 'YouPI-PG UPI';
}

/**
 * Converts a standard NPCI `upi://pay?...` URI into an app-specific mobile deep link
 * using the app's registered scheme (`tez://upi/pay`, `paytmmp://pay`, `phonepe://pay`,
 * or `upi://pay` for Amazon Pay / universal UPI).
 */
export function buildUpiAppIntentUri(upiUri: string, appId: UpiAppId = 'any'): string {
  const trimmed = upiUri.trim();
  if (!trimmed.startsWith('upi://pay?')) {
    return trimmed;
  }
  const query = trimmed.slice('upi://pay?'.length);
  const option = getUpiAppOption(appId);
  return `${option.schemePrefix}?${query}`;
}

/**
 * Builds an Android `intent://` URI targeting a specific UPI app package
 * (e.g., GPay, Paytm, Amazon Pay, PhonePe) with safe NPCI parameter preservation
 * and an optional `S.browser_fallback_url` when the target app is not installed.
 */
export function buildAndroidUpiIntentUri(
  upiUri: string,
  appId: UpiAppId = 'any',
  fallbackUrl?: string
): string {
  const trimmed = upiUri.trim();
  if (!trimmed.startsWith('upi://pay?')) {
    return trimmed;
  }
  const option = getUpiAppOption(appId);
  if (!option.androidPackage) {
    return trimmed;
  }
  const query = trimmed.slice('upi://pay?'.length);
  const cleanFallback = fallbackUrl?.trim();
  const fallbackSegment =
    cleanFallback && /^https?:\/\//i.test(cleanFallback)
      ? `S.browser_fallback_url=${encodeURIComponent(cleanFallback)};`
      : '';
  return `intent://pay?${query}#Intent;scheme=upi;package=${option.androidPackage};${fallbackSegment}end`;
}

export function isAndroidDevice(userAgent?: string): boolean {
  const ua =
    userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  return /android/i.test(ua);
}

export function isIosDevice(userAgent?: string): boolean {
  const ua =
    userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  return !/android/i.test(ua) && /iphone|ipad|ipod/i.test(ua);
}

export function isMobileDevice(userAgent?: string): boolean {
  const ua =
    userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  return /android|iphone|ipad|ipod/i.test(ua);
}

export type MobilePlatform = 'android' | 'ios' | 'desktop';

export function detectMobilePlatform(userAgent?: string): MobilePlatform {
  if (isAndroidDevice(userAgent)) return 'android';
  if (isIosDevice(userAgent)) return 'ios';
  return 'desktop';
}

export interface BuildDynamicAppUpiUriInput extends BuildNpciUpiUriInput {
  appId: UpiAppId;
  androidIntent?: boolean;
  userAgent?: string;
  fallbackUrl?: string;
}

/**
 * Dynamically generates an app-specific UPI payment URI directly from order/payment parameters.
 * When `androidIntent` is omitted, Android user agents automatically resolve to `intent://` package URIs.
 */
export function buildDynamicAppUpiUri(input: BuildDynamicAppUpiUriInput): string {
  const baseUri = buildNpciUpiUri(input);
  const useAndroidIntent =
    input.androidIntent ??
    (input.userAgent !== undefined ? isAndroidDevice(input.userAgent) : isAndroidDevice());

  if (useAndroidIntent) {
    return buildAndroidUpiIntentUri(baseUri, input.appId, input.fallbackUrl);
  }
  return buildUpiAppIntentUri(baseUri, input.appId);
}

export interface DynamicUpiUriOptions {
  androidIntent?: boolean;
  userAgent?: string;
  fallbackUrl?: string;
}

/**
 * Dynamically generates a Google Pay (`tez://upi/pay?...` or Android `com.google.android.apps.nbu.paisa.user` intent) URI.
 */
export function buildGooglePayUpiUri(
  input: BuildNpciUpiUriInput,
  options?: DynamicUpiUriOptions
): string {
  return buildDynamicAppUpiUri({
    ...input,
    appId: 'gpay',
    androidIntent: options?.androidIntent,
    userAgent: options?.userAgent,
    fallbackUrl: options?.fallbackUrl,
  });
}

/**
 * Dynamically generates a Paytm (`paytmmp://pay?...` or Android `net.one97.paytm` intent) URI.
 */
export function buildPaytmUpiUri(
  input: BuildNpciUpiUriInput,
  options?: DynamicUpiUriOptions
): string {
  return buildDynamicAppUpiUri({
    ...input,
    appId: 'paytm',
    androidIntent: options?.androidIntent,
    userAgent: options?.userAgent,
    fallbackUrl: options?.fallbackUrl,
  });
}

/**
 * Dynamically generates an Amazon Pay (`upi://pay?...` or Android `in.amazon.mShop.android.shopping` intent) URI.
 */
export function buildAmazonPayUpiUri(
  input: BuildNpciUpiUriInput,
  options?: DynamicUpiUriOptions
): string {
  return buildDynamicAppUpiUri({
    ...input,
    appId: 'amazonpay',
    androidIntent: options?.androidIntent,
    userAgent: options?.userAgent,
    fallbackUrl: options?.fallbackUrl,
  });
}

/**
 * Resolves the optimal one-tap launch URI from an NPCI `upi://pay?...` URI:
 * - On Android, routes via explicit `intent://` package targeting (GPay, Paytm, Amazon Pay, PhonePe).
 * - On iOS/Desktop, uses the registered app scheme (`tez://upi/pay`, `paytmmp://pay`, `phonepe://pay`, or `upi://pay`).
 */
export function getOneTapUpiUri(
  upiUri: string,
  appId: UpiAppId = 'any',
  userAgent?: string,
  fallbackUrl?: string
): string {
  if (isAndroidDevice(userAgent)) {
    return buildAndroidUpiIntentUri(upiUri, appId, fallbackUrl);
  }
  return buildUpiAppIntentUri(upiUri, appId);
}

export interface MobileOneTapDeepLinkInput extends BuildNpciUpiUriInput {
  userAgent?: string;
  androidFallbackUrl?: string;
}

export interface OneTapMobileDeepLink {
  appId: UpiAppId;
  label: string;
  platform: MobilePlatform;
  isMobile: boolean;
  primaryUri: string;
  schemeUri: string;
  androidIntentUri: string;
  iosUri: string;
  fallbackNpciUri: string;
  androidPackage?: string;
}

/**
 * Generates platform-aware one-tap mobile deep-link URIs (`primaryUri`, iOS/scheme URI,
 * Android `intent://` package URI, and universal NPCI fallback) for any supported UPI app.
 */
export function generateMobileUpiDeepLink(
  input: MobileOneTapDeepLinkInput & { appId?: UpiAppId }
): OneTapMobileDeepLink {
  const appId = input.appId ?? 'any';
  const option = getUpiAppOption(appId);
  const platform = detectMobilePlatform(input.userAgent);
  const fallbackNpciUri = buildNpciUpiUri(input);
  const schemeUri = buildUpiAppIntentUri(fallbackNpciUri, appId);
  const androidIntentUri = buildAndroidUpiIntentUri(
    fallbackNpciUri,
    appId,
    input.androidFallbackUrl
  );

  return {
    appId,
    label: option.label,
    platform,
    isMobile: platform !== 'desktop',
    primaryUri: platform === 'android' ? androidIntentUri : schemeUri,
    schemeUri,
    androidIntentUri,
    iosUri: schemeUri,
    fallbackNpciUri,
    androidPackage: option.androidPackage,
  };
}

/**
 * Generates Google Pay one-tap mobile deep-link URIs (`tez://upi/pay?...` for iOS/universal
 * and `intent://pay?...#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end` for Android).
 */
export function generateGooglePayDeepLinkUri(
  input: MobileOneTapDeepLinkInput
): OneTapMobileDeepLink {
  return generateMobileUpiDeepLink({ ...input, appId: 'gpay' });
}

/**
 * Generates Paytm one-tap mobile deep-link URIs (`paytmmp://pay?...` for iOS/universal
 * and `intent://pay?...#Intent;scheme=upi;package=net.one97.paytm;end` for Android).
 */
export function generatePaytmDeepLinkUri(
  input: MobileOneTapDeepLinkInput
): OneTapMobileDeepLink {
  return generateMobileUpiDeepLink({ ...input, appId: 'paytm' });
}

/**
 * Generates Amazon Pay one-tap mobile deep-link URIs (`upi://pay?...` for iOS/universal
 * and `intent://pay?...#Intent;scheme=upi;package=in.amazon.mShop.android.shopping;end` for Android).
 */
export function generateAmazonPayDeepLinkUri(
  input: MobileOneTapDeepLinkInput
): OneTapMobileDeepLink {
  return generateMobileUpiDeepLink({ ...input, appId: 'amazonpay' });
}

/**
 * Generates mobile one-tap deep-link URI bundles for all supported UPI apps
 * (Google Pay, Paytm, Amazon Pay, PhonePe, Any UPI).
 */
export function generateAllMobileOneTapDeepLinks(
  input: MobileOneTapDeepLinkInput
): Record<UpiAppId, OneTapMobileDeepLink> {
  const result = {} as Record<UpiAppId, OneTapMobileDeepLink>;
  for (const option of UPI_APP_OPTIONS) {
    result[option.id] = generateMobileUpiDeepLink({ ...input, appId: option.id });
  }
  return result;
}

export interface GeneratedAppUpiUri {
  appId: UpiAppId;
  label: string;
  schemeUri: string;
  androidIntentUri: string;
  oneTapUri: string;
}

/**
 * Generates dynamic payment URIs for all supported UPI apps (Google Pay, Paytm, Amazon Pay, PhonePe, Any UPI).
 */
export function buildAllUpiAppUris(
  input: BuildNpciUpiUriInput,
  userAgentOrOptions?: string | { userAgent?: string; fallbackUrl?: string }
): Record<UpiAppId, GeneratedAppUpiUri> {
  const baseUri = buildNpciUpiUri(input);
  const userAgent =
    typeof userAgentOrOptions === 'string'
      ? userAgentOrOptions
      : userAgentOrOptions?.userAgent;
  const fallbackUrl =
    typeof userAgentOrOptions === 'string'
      ? undefined
      : userAgentOrOptions?.fallbackUrl;
  const result = {} as Record<UpiAppId, GeneratedAppUpiUri>;

  for (const option of UPI_APP_OPTIONS) {
    const schemeUri = buildUpiAppIntentUri(baseUri, option.id);
    const androidIntentUri = buildAndroidUpiIntentUri(baseUri, option.id, fallbackUrl);
    result[option.id] = {
      appId: option.id,
      label: option.label,
      schemeUri,
      androidIntentUri,
      oneTapUri: isAndroidDevice(userAgent) ? androidIntentUri : schemeUri,
    };
  }

  return result;
}

export interface BuildStaticUpiQrInput {
  payeeVpa: string;
  payeeName?: string;
  amountInr?: string | number;
  note?: string;
  merchantCode?: string;
}

/**
 * Builds a reusable static NPCI `upi://pay?...` payload (without expiring `tr` reference)
 * for Scan-and-Pay fallback when app deep-link intents are unavailable.
 */
export function buildStaticUpiQrUri(input: BuildStaticUpiQrInput): string {
  const pa = input.payeeVpa.trim();
  if (!isValidUpiVpa(pa)) {
    throw new Error(`Invalid UPI ID "${pa}". Enter a valid VPA like name@bank.`);
  }

  const cleanName = (input.payeeName || 'Seth Sawariya Cafe')
    .replace(/[^\w\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50) || 'Cafe';

  const pairs: string[] = [
    `pa=${pa}`,
    `pn=${encodeURIComponent(cleanName)}`,
  ];

  if (input.amountInr !== undefined && input.amountInr !== '') {
    const parsedAmount =
      typeof input.amountInr === 'number' ? input.amountInr : Number.parseFloat(input.amountInr);
    if (Number.isFinite(parsedAmount) && parsedAmount > 0) {
      pairs.push(`am=${parsedAmount.toFixed(2)}`);
    }
  }

  pairs.push('cu=INR');

  if (input.merchantCode && /^\d{4}$/.test(input.merchantCode.trim())) {
    pairs.push(`mc=${input.merchantCode.trim()}`);
  }

  if (input.note && input.note.trim()) {
    const cleanNote = input.note
      .replace(/[#&=+?%]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50);
    if (cleanNote) {
      pairs.push(`tn=${encodeURIComponent(cleanNote)}`);
    }
  }

  return `upi://pay?${pairs.join('&')}`;
}

/**
 * Builds a static app-targeted UPI URI (`tez://upi/pay?...`, `paytmmp://pay?...`,
 * `phonepe://pay?...`, or `upi://pay?...` for Amazon Pay / universal UPI).
 */
export function buildStaticAppQrUri(
  input: BuildStaticUpiQrInput & { appId?: UpiAppId }
): string {
  const baseStaticUri = buildStaticUpiQrUri(input);
  return buildUpiAppIntentUri(baseStaticUri, input.appId ?? 'any');
}

export interface GenerateUpiQrOptions {
  width?: number;
  margin?: number;
  darkColor?: string;
  lightColor?: string;
}

/**
 * Generates a self-contained `data:image/png;base64,...` QR code URL for any UPI URI
 * with no external network dependency.
 */
export async function generateUpiQrDataUrl(
  upiPayload: string,
  options: GenerateUpiQrOptions = {}
): Promise<string> {
  return QRCode.toDataURL(upiPayload, {
    width: options.width ?? 240,
    margin: options.margin ?? 2,
    color: {
      dark: options.darkColor ?? '#17120f',
      light: options.lightColor ?? '#fffaf3',
    },
  });
}

export interface StaticAppQrResult {
  appId: UpiAppId;
  label: string;
  qrPayloadUri: string;
  appDeepLinkUri: string;
  androidIntentUri: string;
  qrCodeUrl: string;
}

/**
 * Generates a static Scan-and-Pay QR code URL (`data:image/png;base64,...`) plus NPCI & app deep-link URIs
 * for a given UPI app (GPay, Paytm, Amazon Pay, PhonePe, or Any UPI).
 */
export async function generateStaticAppQrCodeUrl(
  input: BuildStaticUpiQrInput & {
    appId?: UpiAppId;
    useAppSchemeInQr?: boolean;
  } & GenerateUpiQrOptions
): Promise<StaticAppQrResult> {
  const appId = input.appId ?? 'any';
  const option = getUpiAppOption(appId);
  const qrPayloadUri = buildStaticUpiQrUri(input);
  const appDeepLinkUri = buildUpiAppIntentUri(qrPayloadUri, appId);
  const androidIntentUri = buildAndroidUpiIntentUri(qrPayloadUri, appId);
  const qrTarget = input.useAppSchemeInQr ? appDeepLinkUri : qrPayloadUri;
  const qrCodeUrl = await generateUpiQrDataUrl(qrTarget, {
    width: input.width,
    margin: input.margin,
    darkColor: input.darkColor,
    lightColor: input.lightColor,
  });

  return {
    appId,
    label: option.label,
    qrPayloadUri,
    appDeepLinkUri,
    androidIntentUri,
    qrCodeUrl,
  };
}

/**
 * Generates a static QR code URL and GPay URI (`tez://upi/pay`) for scanning directly in Google Pay.
 */
export async function generateGooglePayStaticQrUrl(
  input: BuildStaticUpiQrInput,
  options: GenerateUpiQrOptions = {}
): Promise<StaticAppQrResult> {
  return generateStaticAppQrCodeUrl({
    ...input,
    ...options,
    appId: 'gpay',
  });
}

/**
 * Generates a static QR code URL and Paytm URI (`paytmmp://pay`) for scanning directly in Paytm.
 */
export async function generatePaytmStaticQrUrl(
  input: BuildStaticUpiQrInput,
  options: GenerateUpiQrOptions = {}
): Promise<StaticAppQrResult> {
  return generateStaticAppQrCodeUrl({
    ...input,
    ...options,
    appId: 'paytm',
  });
}

/**
 * Generates a static QR code URL and Amazon Pay UPI URI (`upi://pay` + `in.amazon.mShop.android.shopping` intent)
 * for scanning directly in Amazon Pay.
 */
export async function generateAmazonPayStaticQrUrl(
  input: BuildStaticUpiQrInput,
  options: GenerateUpiQrOptions = {}
): Promise<StaticAppQrResult> {
  return generateStaticAppQrCodeUrl({
    ...input,
    ...options,
    appId: 'amazonpay',
  });
}

/**
 * Generates static Scan-and-Pay QR code URLs for all supported UPI apps
 * (Google Pay, Paytm, Amazon Pay, PhonePe, Any UPI).
 */
export async function generateAllStaticAppQrUrls(
  input: BuildStaticUpiQrInput,
  options: GenerateUpiQrOptions = {}
): Promise<Record<UpiAppId, StaticAppQrResult>> {
  const entries = await Promise.all(
    UPI_APP_OPTIONS.map(async (opt) => {
      const qr = await generateStaticAppQrCodeUrl({
        ...input,
        ...options,
        appId: opt.id,
      });
      return [opt.id, qr] as const;
    })
  );
  return Object.fromEntries(entries) as Record<UpiAppId, StaticAppQrResult>;
}

