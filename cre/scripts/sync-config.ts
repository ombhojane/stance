// Copies market / receiver / feed from contracts/deployments/84532.json into the workflow configs.
// Run from the cre/ directory:  bun scripts/sync-config.ts
const root = new URL('..', import.meta.url).pathname
const deploymentsPath = `${root}../contracts/deployments/84532.json`
const configs = ['stance-settler/config.staging.json', 'stance-settler/config.production.json']

const deployments = (await Bun.file(deploymentsPath).json()) as Record<string, string>
for (const key of ['market', 'receiver', 'feed']) {
	if (!/^0x[0-9a-fA-F]{40}$/.test(deployments[key] ?? '')) throw new Error(`${deploymentsPath}: missing "${key}"`)
}

for (const rel of configs) {
	const path = `${root}${rel}`
	const cfg = (await Bun.file(path).json()) as Record<string, unknown>
	cfg.marketAddress = deployments.market
	cfg.receiverAddress = deployments.receiver
	cfg.feedAddress = deployments.feed
	await Bun.write(path, `${JSON.stringify(cfg, null, 2)}\n`)
	console.log(`updated ${rel}: market=${deployments.market} receiver=${deployments.receiver} feed=${deployments.feed}`)
}
