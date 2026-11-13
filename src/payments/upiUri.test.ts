import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEMO_PLACEHOLDER_VPA,
  UPI_APP_OPTIONS,
  buildAllUpiAppUris,
  buildAmazonPayUpiUri,
  buildAndroidUpiIntentUri,
  buildDynamicAppUpiUri,
  buildGooglePayUpiUri,
  buildNpciUpiUri,
  buildPaytmUpiUri,
  buildStaticAppQrUri,
  buildStaticUpiQrUri,
  buildUpiAppIntentUri,
  detectMobilePlatform,
  generateAllMobileOneTapDeepLinks,
  generateAllStaticAppQrUrls,
  generateAmazonPayDeepLinkUri,
  generateAmazonPayStaticQrUrl,
  generateGooglePayDeepLinkUri,
  generateGooglePayStaticQrUrl,
  generateMobileUpiDeepLink,
  generatePaytmDeepLinkUri,
  generatePaytmStaticQrUrl,
  getOneTapUpiUri,
  getUpiAppOption,
  isAndroidDevice,
  isDemoPlaceholderVpa,
  isIosDevice,
  isMobileDevice,
  isValidUpiVpa,
} from './upiUri';

test('isValidUpiVpa validates real VPAs and rejects invalid ones', () => {
  assert.equal(isValidUpiVpa('merchant@okhdfcbank'), true);
  assert.equal(isValidUpiVpa('9876543210@ybl'), true);
  assert.equal(isValidUpiVpa('seth.cafe_01@paytm'), true);

  assert.equal(isValidUpiVpa(''), false);
  assert.equal(isValidUpiVpa('not-a-vpa'), false);
  assert.equal(isValidUpiVpa('a@b@c'), false);
  assert.equal(isValidUpiVpa('user name@okicici'), false);
  assert.equal(isValidUpiVpa('http://example.com@upi'), false);
  assert.equal(isValidUpiVpa('a@bank.'), false);
});

test('isDemoPlaceholderVpa detects empty and default demo VPAs', () => {
  assert.equal(isDemoPlaceholderVpa(undefined), true);
  assert.equal(isDemoPlaceholderVpa(''), true);
  assert.equal(isDemoPlaceholderVpa(DEMO_PLACEHOLDER_VPA), true);
  assert.equal(isDemoPlaceholderVpa('realmerchant@okaxis'), false);
});

test('buildNpciUpiUri preserves literal @ in pa, uses %20 spaces, and sanitizes tr/tn', () => {
  const uri = buildNpciUpiUri({
    payeeVpa: 'realshop@okicici',
    payeeName: 'Seth Sawariya Cafe',
    amountInr: '354.00',
    transactionRef: '550e8400-e29b-41d4-a716-446655440000',
    note: 'Order #ORD-1001',
  });

  assert.equal(uri.includes('pa=realshop@okicici'), true);
  assert.equal(uri.includes('%40'), false);
  assert.equal(uri.includes('pn=Seth%20Sawariya%20Cafe'), true);
  assert.equal(uri.includes('+'), false);
  assert.equal(uri.includes('am=354.00'), true);
  assert.equal(uri.includes('cu=INR'), true);
  assert.equal(uri.includes('tr=550e8400e29b41d4a716446655440000'), true);
  assert.equal(uri.includes('tn=Order%20ORD-1001'), true);
});

test('buildUpiAppIntentUri generates app-specific deep links for Paytm, GPay, PhonePe, and standard UPI', () => {
  const baseUri = 'upi://pay?pa=7340131002@pthdfc&pn=Seth%20Sawariya%20Cafe&am=180.00&cu=INR';
  assert.equal(
    buildUpiAppIntentUri(baseUri, 'paytm'),
    'paytmmp://pay?pa=7340131002@pthdfc&pn=Seth%20Sawariya%20Cafe&am=180.00&cu=INR'
  );
  assert.equal(
    buildUpiAppIntentUri(baseUri, 'gpay'),
    'tez://upi/pay?pa=7340131002@pthdfc&pn=Seth%20Sawariya%20Cafe&am=180.00&cu=INR'
  );
  assert.equal(
    buildUpiAppIntentUri(baseUri, 'phonepe'),
    'phonepe://pay?pa=7340131002@pthdfc&pn=Seth%20Sawariya%20Cafe&am=180.00&cu=INR'
  );
  assert.equal(buildUpiAppIntentUri(baseUri, 'amazonpay'), baseUri);
  assert.equal(buildUpiAppIntentUri(baseUri, 'any'), baseUri);
});

test('UPI_APP_OPTIONS and buildAndroidUpiIntentUri expose GPay, Paytm, Amazon Pay, and PhonePe package identifiers', () => {
  const ids = UPI_APP_OPTIONS.map((opt) => opt.id);
  assert.deepEqual(ids, ['gpay', 'paytm', 'amazonpay', 'phonepe', 'any']);

  assert.equal(getUpiAppOption('gpay').androidPackage, 'com.google.android.apps.nbu.paisa.user');
  assert.equal(getUpiAppOption('paytm').androidPackage, 'net.one97.paytm');
  assert.equal(getUpiAppOption('amazonpay').androidPackage, 'in.amazon.mShop.android.shopping');
  assert.equal(getUpiAppOption('phonepe').androidPackage, 'com.phonepe.app');
  assert.equal(getUpiAppOption('any').androidPackage, undefined);

  const baseUri = 'upi://pay?pa=7340131002@pthdfc&pn=Cafe&am=250.00&cu=INR';
  assert.equal(
    buildAndroidUpiIntentUri(baseUri, 'gpay'),
    'intent://pay?pa=7340131002@pthdfc&pn=Cafe&am=250.00&cu=INR#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end'
  );
  assert.equal(
    buildAndroidUpiIntentUri(baseUri, 'paytm'),
    'intent://pay?pa=7340131002@pthdfc&pn=Cafe&am=250.00&cu=INR#Intent;scheme=upi;package=net.one97.paytm;end'
  );
  assert.equal(
    buildAndroidUpiIntentUri(baseUri, 'amazonpay'),
    'intent://pay?pa=7340131002@pthdfc&pn=Cafe&am=250.00&cu=INR#Intent;scheme=upi;package=in.amazon.mShop.android.shopping;end'
  );
  assert.equal(buildAndroidUpiIntentUri(baseUri, 'any'), baseUri);
});

test('Dynamic Google Pay, Paytm, Amazon Pay URI builders and buildAllUpiAppUris generate valid one-tap URIs', () => {
  const input = {
    payeeVpa: '7340131002@pthdfc',
    payeeName: 'Seth Sawariya Cafe',
    amountInr: 327,
    transactionRef: 'ORD327',
    note: 'Table T3 Order',
  };

  const gpayUri = buildGooglePayUpiUri(input);
  assert.equal(
    gpayUri,
    'tez://upi/pay?pa=7340131002@pthdfc&pn=Seth%20Sawariya%20Cafe&am=327.00&cu=INR&tr=ORD327&tn=Table%20T3%20Order'
  );
  assert.equal(
    buildGooglePayUpiUri(input, { androidIntent: true }).endsWith(
      '#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end'
    ),
    true
  );

  const paytmUri = buildPaytmUpiUri(input);
  assert.equal(paytmUri.startsWith('paytmmp://pay?pa=7340131002@pthdfc&'), true);
  assert.equal(
    buildPaytmUpiUri(input, { androidIntent: true }).endsWith(
      '#Intent;scheme=upi;package=net.one97.paytm;end'
    ),
    true
  );

  const amazonUri = buildAmazonPayUpiUri(input);
  assert.equal(amazonUri.startsWith('upi://pay?pa=7340131002@pthdfc&'), true);
  assert.equal(
    buildAmazonPayUpiUri(input, { androidIntent: true }).endsWith(
      '#Intent;scheme=upi;package=in.amazon.mShop.android.shopping;end'
    ),
    true
  );

  assert.equal(buildDynamicAppUpiUri({ ...input, appId: 'gpay' }), gpayUri);

  const androidUa = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36';
  const iosUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)';
  assert.equal(isAndroidDevice(androidUa), true);
  assert.equal(isAndroidDevice(iosUa), false);
  assert.equal(isMobileDevice(iosUa), true);

  const baseNpci = buildNpciUpiUri(input);
  assert.equal(
    getOneTapUpiUri(baseNpci, 'amazonpay', androidUa).includes('package=in.amazon.mShop.android.shopping'),
    true
  );
  assert.equal(getOneTapUpiUri(baseNpci, 'gpay', iosUa), gpayUri);

  const allUris = buildAllUpiAppUris(input, androidUa);
  assert.equal(allUris.gpay.schemeUri, gpayUri);
  assert.equal(allUris.paytm.schemeUri, paytmUri);
  assert.equal(allUris.amazonpay.schemeUri, amazonUri);
  assert.equal(
    allUris.amazonpay.oneTapUri.includes('package=in.amazon.mShop.android.shopping'),
    true
  );
});

test('Static QR code URL generators build scan-and-pay PNG data URLs and static URIs for GPay, Paytm, and Amazon Pay', async () => {
  const staticInput = {
    payeeVpa: '7340131002@pthdfc',
    payeeName: 'Seth Sawariya Cafe',
    amountInr: 327,
    note: 'Counter Static QR',
    merchantCode: '5814',
  };

  const staticUri = buildStaticUpiQrUri(staticInput);
  assert.equal(
    staticUri,
    'upi://pay?pa=7340131002@pthdfc&pn=Seth%20Sawariya%20Cafe&am=327.00&cu=INR&mc=5814&tn=Counter%20Static%20QR'
  );
  assert.equal(staticUri.includes('tr='), false);

  assert.equal(
    buildStaticAppQrUri({ ...staticInput, appId: 'gpay' }).startsWith('tez://upi/pay?'),
    true
  );
  assert.equal(
    buildStaticAppQrUri({ ...staticInput, appId: 'paytm' }).startsWith('paytmmp://pay?'),
    true
  );
  assert.equal(
    buildStaticAppQrUri({ ...staticInput, appId: 'amazonpay' }).startsWith('upi://pay?'),
    true
  );

  const [gpayQr, paytmQr, amazonQr, allQrs] = await Promise.all([
    generateGooglePayStaticQrUrl(staticInput),
    generatePaytmStaticQrUrl(staticInput),
    generateAmazonPayStaticQrUrl(staticInput),
    generateAllStaticAppQrUrls(staticInput),
  ]);

  assert.equal(gpayQr.appId, 'gpay');
  assert.equal(gpayQr.qrPayloadUri, staticUri);
  assert.equal(gpayQr.appDeepLinkUri.startsWith('tez://upi/pay?'), true);
  assert.equal(gpayQr.qrCodeUrl.startsWith('data:image/png;base64,'), true);

  assert.equal(paytmQr.appId, 'paytm');
  assert.equal(paytmQr.appDeepLinkUri.startsWith('paytmmp://pay?'), true);
  assert.equal(paytmQr.qrCodeUrl.startsWith('data:image/png;base64,'), true);

  assert.equal(amazonQr.appId, 'amazonpay');
  assert.equal(amazonQr.appDeepLinkUri.startsWith('upi://pay?'), true);
  assert.equal(
    amazonQr.androidIntentUri.includes('package=in.amazon.mShop.android.shopping'),
    true
  );
  assert.equal(amazonQr.qrCodeUrl.startsWith('data:image/png;base64,'), true);

  assert.equal(allQrs.gpay.qrCodeUrl, gpayQr.qrCodeUrl);
  assert.equal(allQrs.paytm.qrCodeUrl, paytmQr.qrCodeUrl);
  assert.equal(allQrs.amazonpay.qrCodeUrl, amazonQr.qrCodeUrl);
});

test('GPay, Paytm, and Amazon Pay mobile deep-link URI generators handle Android, iOS, fallback URLs, and invalid VPAs', () => {
  const androidUa = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36';
  const iosUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)';
  const desktopUa = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36';

  assert.equal(isIosDevice(iosUa), true);
  assert.equal(isIosDevice(androidUa), false);
  assert.equal(detectMobilePlatform(androidUa), 'android');
  assert.equal(detectMobilePlatform(iosUa), 'ios');
  assert.equal(detectMobilePlatform(desktopUa), 'desktop');

  const input = {
    payeeVpa: '7340131002@pthdfc',
    payeeName: 'Seth Sawariya Cafe',
    amountInr: 450,
    transactionRef: 'ORD450MOBILE',
    note: 'One Tap Mobile Order',
  };

  const fallbackUrl = 'https://pay.youpi.cafe/checkout/ORD450MOBILE';

  const gpayAndroid = generateGooglePayDeepLinkUri({
    ...input,
    userAgent: androidUa,
    androidFallbackUrl: fallbackUrl,
  });
  assert.equal(gpayAndroid.appId, 'gpay');
  assert.equal(gpayAndroid.platform, 'android');
  assert.equal(gpayAndroid.isMobile, true);
  assert.equal(gpayAndroid.androidPackage, 'com.google.android.apps.nbu.paisa.user');
  assert.equal(gpayAndroid.schemeUri.startsWith('tez://upi/pay?pa=7340131002@pthdfc&'), true);
  assert.equal(
    gpayAndroid.androidIntentUri.includes(
      `#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`
    ),
    true
  );
  assert.equal(gpayAndroid.primaryUri, gpayAndroid.androidIntentUri);

  const paytmIos = generatePaytmDeepLinkUri({
    ...input,
    userAgent: iosUa,
  });
  assert.equal(paytmIos.appId, 'paytm');
  assert.equal(paytmIos.platform, 'ios');
  assert.equal(paytmIos.isMobile, true);
  assert.equal(paytmIos.iosUri.startsWith('paytmmp://pay?pa=7340131002@pthdfc&'), true);
  assert.equal(paytmIos.primaryUri, paytmIos.iosUri);
  assert.equal(paytmIos.androidIntentUri.includes('package=net.one97.paytm;end'), true);

  const amazonAndroid = generateAmazonPayDeepLinkUri({
    ...input,
    userAgent: androidUa,
  });
  assert.equal(amazonAndroid.appId, 'amazonpay');
  assert.equal(amazonAndroid.platform, 'android');
  assert.equal(amazonAndroid.schemeUri.startsWith('upi://pay?pa=7340131002@pthdfc&'), true);
  assert.equal(
    amazonAndroid.primaryUri.includes('package=in.amazon.mShop.android.shopping;end'),
    true
  );

  // User-agent-aware dynamic builders automatically emit intent:// on Android and schemes on iOS
  assert.equal(
    buildGooglePayUpiUri(input, { userAgent: androidUa }).startsWith('intent://pay?'),
    true
  );
  assert.equal(
    buildGooglePayUpiUri(input, { userAgent: iosUa }).startsWith('tez://upi/pay?'),
    true
  );
  assert.equal(
    buildPaytmUpiUri(input, { userAgent: androidUa }).includes('package=net.one97.paytm'),
    true
  );
  assert.equal(
    buildAmazonPayUpiUri(input, { userAgent: androidUa, fallbackUrl }).includes(
      'S.browser_fallback_url='
    ),
    true
  );

  const allMobile = generateAllMobileOneTapDeepLinks({ ...input, userAgent: iosUa });
  assert.equal(allMobile.gpay.primaryUri, paytmIos.iosUri.replace('paytmmp://pay?', 'tez://upi/pay?'));
  assert.equal(allMobile.paytm.primaryUri, paytmIos.primaryUri);
  assert.equal(allMobile.amazonpay.primaryUri, allMobile.amazonpay.fallbackNpciUri);
  assert.equal(
    generateMobileUpiDeepLink({ ...input, appId: 'phonepe', userAgent: iosUa }).primaryUri.startsWith(
      'phonepe://pay?'
    ),
    true
  );

  assert.throws(
    () =>
      generateGooglePayDeepLinkUri({
        payeeVpa: 'invalid-vpa',
        amountInr: 100,
      }),
    /Invalid UPI ID/
  );
});
