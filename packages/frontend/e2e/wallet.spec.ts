import { expect, test } from '@playwright/test';
import { decodeFunctionData, encodeFunctionResult, type Hex, multicall3Abi, pad } from 'viem';

const ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const PORTAL_MAINNET = '0xb917d893321eab9662c56f22a2f6a37344d740d9';
const TX_HASH = `0x${'ab'.repeat(32)}`;
const FEE = '0x2386f26fc10000'; // 0.01 ETH, not the default fee of the contract
const FEE_SELECTOR = '0xddca3f43';
const MAX_SCRIPT_BYTES_BEFORE_WALLET = 400_000;

// wagmi batches its reads in one Multicall3 call.
function answerMulticall(data: Hex): Hex {
  const { args } = decodeFunctionData({ abi: multicall3Abi, data });
  const calls = args[0] as readonly { callData: Hex }[];
  return encodeFunctionResult({
    abi: multicall3Abi,
    functionName: 'aggregate3',
    result: calls.map(({ callData }) => ({
      success: true,
      returnData: pad(callData === FEE_SELECTOR ? FEE : '0x'),
    })),
  });
}

test('attests a segment with an injected wallet and the fee of the contract', async ({ page }) => {
  const sent: unknown[] = [];
  const scripts: number[] = [];
  const cspErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('Content Security Policy')) {
      cspErrors.push(message.text());
    }
  });
  page.on('response', async (response) => {
    if (response.request().resourceType() === 'script') {
      scripts.push((await response.body().catch(() => Buffer.alloc(0))).length);
    }
  });
  await page.exposeFunction('recordTransaction', (tx: unknown) => sent.push(tx));

  await page.addInitScript(
    ({ account, txHash }) => {
      sessionStorage.setItem('strava_access_token', 'fixture-token');
      sessionStorage.setItem('strava_expires_at', String(Math.floor(Date.now() / 1000) + 3600));
      sessionStorage.setItem('strava_athlete', JSON.stringify({ id: 123, firstname: 'Fixture' }));

      let connected = false;
      const provider = {
        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          switch (method) {
            case 'eth_requestAccounts':
              connected = true;
              return [account];
            case 'eth_accounts':
              return connected ? [account] : [];
            case 'eth_chainId':
              return '0xe708';
            case 'eth_sendTransaction':
              await (
                window as unknown as { recordTransaction: (tx: unknown) => Promise<void> }
              ).recordTransaction(params?.[0]);
              return txHash;
            case 'wallet_requestPermissions':
            case 'wallet_getPermissions':
              return [{ parentCapability: 'eth_accounts' }];
            default:
              return null;
          }
        },
        on: (): void => undefined,
        removeListener: (): void => undefined,
      };
      const announce = (): boolean =>
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: Object.freeze({
              info: {
                uuid: '4f2c1d86-6f0a-4a57-9b1c-5c1d3f0e2a11',
                name: 'Test Wallet',
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
                rdns: 'test.wallet',
              },
              provider,
            }),
          }),
        );
      window.addEventListener('eip6963:requestProvider', announce);
      announce();
    },
    { account: ACCOUNT, txHash: TX_HASH },
  );

  // No request leaves the test: each remote host that has no mock below gets an empty answer.
  await page.route(
    (url) => url.host !== '127.0.0.1:4177',
    (route) => route.fulfill({ json: {} }),
  );
  await page.route('https://www.strava.com/api/v3/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/athlete/activities')) {
      await route.fulfill({
        json: [
          {
            id: 1,
            name: 'Morning Ride',
            type: 'Ride',
            start_date: '2026-01-01T10:00:00Z',
            distance: 1000,
          },
        ],
      });
      return;
    }
    await route.fulfill({
      json: {
        segment_efforts: [
          {
            start_date: '2026-01-01T10:05:00Z',
            segment: { id: 42, name: 'Test Climb', distance: 1200, activity_type: 'Ride' },
          },
        ],
      },
    });
  });
  await page.route('**/.netlify/functions/sign', (route) =>
    route.fulfill({
      json: {
        segmentId: 42,
        completionDate: 1767261900,
        deadline: 1999999999,
        signature: `0x${'11'.repeat(65)}`,
      },
    }),
  );
  await page.route('https://linea-mainnet.infura.io/**', async (route) => {
    const body = route.request().postDataJSON() as {
      id: number;
      method: string;
      params: [{ data: Hex }];
    };
    const results: Record<string, unknown> = {
      eth_chainId: '0xe708',
      eth_blockNumber: '0x10',
      eth_call: body.method === 'eth_call' ? answerMulticall(body.params[0].data) : null,
      eth_getTransactionReceipt: {
        transactionHash: TX_HASH,
        blockNumber: '0x10',
        blockHash: `0x${'cd'.repeat(32)}`,
        status: '0x1',
        from: ACCOUNT,
        to: PORTAL_MAINNET,
        logs: [],
        gasUsed: '0x5208',
        cumulativeGasUsed: '0x5208',
        effectiveGasPrice: '0x1',
        transactionIndex: '0x0',
        logsBloom: `0x${'00'.repeat(256)}`,
        type: '0x2',
        contractAddress: null,
      },
    };
    await route.fulfill({
      json: { jsonrpc: '2.0', id: body.id, result: results[body.method] ?? null },
    });
  });

  await page.goto('/attestations');
  await expect(page.getByRole('button', { name: /Morning Ride/ })).toBeVisible();
  // The wallet code is about 2.9 MB: it must not load before the athlete asks for a wallet.
  expect(scripts.reduce((sum, size) => sum + size, 0)).toBeLessThan(MAX_SCRIPT_BYTES_BEFORE_WALLET);

  await page.getByRole('button', { name: /connect wallet/i }).click();
  await page.getByText('Test Wallet').click();
  await expect(page.getByRole('button', { name: '0xf39F...2266' })).toBeVisible();

  await page.getByRole('button', { name: /Morning Ride/ }).click();
  await expect(page.getByText('Fee 0.01 ETH')).toBeVisible();
  await page.getByRole('button', { name: /attest/i }).click();
  await expect(page.getByRole('status')).toContainText('Attestation confirmed');
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ from: ACCOUNT, to: PORTAL_MAINNET, value: FEE });
  expect(cspErrors).toEqual([]);
});
