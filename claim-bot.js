const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const SITE = 'https://codigoampeter.com/tarjeta-regalo';
const KEYDROP_DEPOSIT = 'https://key-drop.com/panel/profil?p=payment';
const POLL_INTERVAL = 500; // ms between status checks
const TURNSTILE_TIMEOUT = 30000; // max wait for turnstile

let previousState = null;

async function log(msg) {
  const ts = new Date().toLocaleTimeString('es-AR', { hour12: false });
  console.log(`[${ts}] ${msg}`);
}

async function waitForStateChange(page) {
  return page.evaluate((interval) => {
    return new Promise((resolve) => {
      const check = async () => {
        try {
          const res = await fetch('/api/status');
          const data = await res.json();
          resolve(data);
        } catch { setTimeout(check, interval); }
      };
      check();
    });
  }, POLL_INTERVAL);
}

(async () => {
  await log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/usr/bin/google-chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,720',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  await log('Loading page...');
  await page.goto(SITE, { waitUntil: 'networkidle2', timeout: 30000 });
  await log('Page loaded. Monitoring for state change...');

  // Poll until state is NOT countdown
  while (true) {
    const status = await waitForStateChange(page);

    if (status.state !== previousState) {
      await log(`State: ${previousState} -> ${status.state}`);
      previousState = status.state;
    }

    if (status.state !== 'countdown') {
      break;
    }

    // Still countdown — wait and check again
    await new Promise(r => setTimeout(r, 1000));
  }

  // State changed! Could be verification_required
  if (previousState === 'verification_required' || previousState === 'revealed') {
    await log('Verification window opened! Waiting for Turnstile to solve...');

    // The Turnstile widget should auto-solve in a real browser
    // Wait for the reveal button to become clickable
    const code = await page.evaluate(async (timeout) => {
      const start = Date.now();

      while (Date.now() - start < timeout) {
        // Check if we already have the code in state
        const res = await fetch('/api/status');
        const data = await res.json();

        // Try to find the reveal function on window or through the app
        // The Turnstile callback should fire and auto-trigger reveal

        // Wait for turnstile token
        const tokenEl = document.querySelector('[name="cf-turnstile-response"]');
        if (tokenEl && tokenEl.value && tokenEl.value.length > 10) {
          const token = tokenEl.value;

          // Call reveal directly
          const revealRes = await fetch('/api/status/reveal', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ turnstileToken: token })
          });

          const result = await revealRes.json();
          if (result.code) return result.code;
        }

        await new Promise(r => setTimeout(r, 100));
      }
      return null;
    }, TURNSTILE_TIMEOUT);

    if (code) {
      await log(`🚨 CODE CLAIMED: ${code}`);
      await log(`Redeeming on key-drop.com...`);

      // Navigate to key-drop deposit page
      await page.goto(KEYDROP_DEPOSIT, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Find the gift card input and paste the code
      // The exact selectors depend on key-drop's UI
      const selectors = [
        'input[placeholder*="code"]',
        'input[placeholder*="Gift"]',
        'input[placeholder*="gift"]',
        'input[name="code"]',
        'input[name="giftcard"]',
        'input[type="text"]',
      ];

      let input = null;
      for (const sel of selectors) {
        input = await page.$(sel);
        if (input) {
          await input.click({ clickCount: 3 });
          await input.type(code);
          await log(`Pasted code into: ${sel}`);

          // Find and click redeem button
          const buttons = await page.$$('button');
          for (const btn of buttons) {
            const text = await btn.evaluate(el => el.textContent.toLowerCase());
            if (text.includes('redeem') || text.includes('canjear') || text.includes('validar')) {
              await btn.click();
              await log('Clicked redeem button!');
              await page.waitForTimeout(5000);
              break;
            }
          }
          break;
        }
      }

      if (!input) {
        await log('Could not find gift card input on key-drop');
        await log('Manual redeem: ' + code);
      }

      await page.screenshot({ path: '/tmp/keydrop-result.png' });
      await log('Screenshot saved to /tmp/keydrop-result.png');
    } else {
      await log('Failed to get Turnstile token within timeout');
      await log('You may need to use headed mode (headless: false)');
    }
  }

  await browser.close();
  await log('Done');
})();
