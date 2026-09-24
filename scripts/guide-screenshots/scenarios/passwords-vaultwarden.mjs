// Passwords use case: the Vaultwarden web vault as a first-time household member.
// Mirrors the kombify flow: the owner invites an email address, the person
// creates the account with that address, then saves a first entry.
import { randomBytes } from 'node:crypto';

const VAULT = 'https://vault.home.test';
const PERSON = { email: 'alex@example.com', name: 'Alex Example' };

export default {
  useCase: 'passwords',
  app: 'vaultwarden',
  compose: 'apps/vaultwarden/compose.yaml',
  hosts: { 'vault.home.test': 8443 },
  secrets: ['GUIDE_ADMIN_TOKEN'],
  viewport: { width: 1280, height: 960 },

  async run({ page, shot, env }) {
    // Synthetic master password, regenerated per run and never stored.
    const masterPassword = `Example-${randomBytes(9).toString('base64url')}-Guide`;

    await page.goto(`${VAULT}/alive`);
    const invited = await page.evaluate(async ({ token, email }) => {
      await fetch('/admin', { method: 'POST', body: new URLSearchParams({ token }) });
      const response = await fetch('/admin/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      return response.status;
    }, { token: env.GUIDE_ADMIN_TOKEN, email: PERSON.email });
    if (invited !== 200) throw new Error(`admin invite failed with HTTP ${invited}`);
    const versions = await page.evaluate(async () => ({
      appVersion: (await (await fetch('/api/version')).json()),
      webVaultVersion: (await (await fetch('/version.json')).json()).version,
    }));

    await page.goto(`${VAULT}/#/login`, { waitUntil: 'networkidle' });
    const createLink = page.getByRole('link', { name: 'Create account' });
    await createLink.waitFor();
    await shot('web-01-open-vault', {
      clip: [page.getByRole('heading', { name: 'Log in' }), createLink],
      pad: { top: 8, right: 48, bottom: 40, left: 48 },
      annotate: [{ n: 2, target: createLink }],
      alt: 'Vaultwarden login page with the Create account link marked',
    });

    await createLink.click();
    await page.getByLabel('Email address').fill(PERSON.email);
    await page.getByLabel('Name').fill(PERSON.name);
    const continueButton = page.getByRole('button', { name: 'Continue' });
    await shot('web-02-create-account', {
      clip: [page.getByRole('heading', { name: 'Create account' }), continueButton],
      pad: { top: 8, right: 48, bottom: 40, left: 48 },
      annotate: [page.getByLabel('Email address'), page.getByLabel('Name'), continueButton],
      alt: 'Create account form with the email address alex@example.com and the name Alex Example',
    });

    await continueButton.click();
    await page.waitForURL(/finish-signup/);
    await page.locator('#input-password-form_new-password').fill(masterPassword);
    await page.locator('#input-password-form_new-password-confirm').fill(masterPassword);
    const createButton = page.getByRole('button', { name: 'Create account' });
    await page.getByText('Strong', { exact: true }).waitFor();
    await shot('web-03-master-password', {
      clip: [page.getByRole('heading', { name: 'Set a strong password' }), createButton],
      pad: { top: 8, right: 48, bottom: 40, left: 48 },
      annotate: [page.locator('#input-password-form_new-password'), page.locator('#input-password-form_new-password-confirm'), createButton],
      alt: 'Set a strong password page with the master password entered twice and rated Strong',
    });

    await createButton.click();
    await page.waitForURL(/setup-extension/);
    await page.getByRole('button', { name: 'Add it later' }).click();
    await page.getByRole('button', { name: 'Skip to web app' }).or(page.getByRole('link', { name: 'Skip to web app' })).click();
    await page.waitForURL(/#\/vault/);
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: 'Dismiss this checklist' }).click().catch(() => {});

    const newButton = page.getByRole('button', { name: 'New' }).first();
    await newButton.click();
    await page.getByRole('menuitem', { name: 'Login' }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'New Login' });
    await dialog.getByRole('textbox', { name: 'Item name' }).fill('Example Shop');
    await dialog.getByRole('textbox', { name: 'Username' }).fill(PERSON.email);
    await dialog.getByRole('button', { name: 'Generate password' }).click();
    await page.getByRole('button', { name: 'Use this password' }).click();
    await page.getByRole('dialog').filter({ hasText: 'Password generator' }).waitFor({ state: 'detached' });
    await dialog.getByRole('textbox', { name: 'Website (URI)' }).first().fill('https://shop.example.com');
    await dialog.getByRole('textbox', { name: 'Item name' }).scrollIntoViewIfNeeded();
    await shot('web-04-new-login', {
      clip: dialog,
      // The dialog role box includes a 16 px transparent margin around the panel.
      pad: -16,
      annotate: [
        { n: 2, target: dialog.getByRole('textbox', { name: 'Item name' }) },
        { n: 3, target: dialog.getByRole('textbox', { name: 'Username' }) },
        { n: 3, target: dialog.getByRole('button', { name: 'Generate password' }) },
        { n: 4, target: dialog.getByRole('button', { name: 'Save' }) },
      ],
      alt: 'New Login window with the item name Example Shop, a username and a generated password',
    });

    await dialog.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).first().click().catch(() => {});
    await page.getByRole('dialog').waitFor({ state: 'detached' }).catch(() => {});
    const row = page.getByRole('row').filter({ hasText: 'Example Shop' });
    await row.waitFor();
    await page.getByText('Item added').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    await shot('web-05-first-item', {
      clip: page.getByRole('table').first(),
      pad: 12,
      annotate: [{ n: null, target: row }],
      alt: 'All vaults list showing the saved Example Shop login',
    });

    return {
      app: 'Vaultwarden',
      appVersion: versions.appVersion,
      webVaultVersion: versions.webVaultVersion,
      address: VAULT,
      syntheticAccount: PERSON.email,
    };
  },
};
