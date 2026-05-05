/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import { Bot, webhookCallback } from 'grammy';

export interface Env {
	TELEGRAM_BOT_TOKEN: string;
	KV: KVNamespace;
}

const DEFAULT_LOCATIONS = ['Food court', 'Guzman', 'SIT canteen'];

export default {
	async fetch(request, env: Env, ctx): Promise<Response> {
		const url = new URL(request.url);

		if (!env.TELEGRAM_BOT_TOKEN) {
			return new Response('Bot token not set', { status: 500 });
		}

		const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

		bot.command('lunch', async (ctx) => {
			if (!ctx.chat) return;
			const key = `locations_${ctx.chat.id}`;

			// Get the locations for this specific group chat from KV
			let locations = (await env.KV.get(key, { type: 'json' })) as string[] | null;
			if (!locations) {
				locations = [...DEFAULT_LOCATIONS];
			}

			if (locations.length === 0) {
				return ctx.reply('No locations configured yet');
			}
			const choice = locations[Math.floor(Math.random() * locations.length)];
			await ctx.reply(`🍽️ Lunch pick: ${choice}`);
		});
		bot.command('list', async (ctx) => {
			if (!ctx.chat) return;
			const key = `locations_${ctx.chat.id}`;

			let locations = (await env.KV.get(key, { type: 'json' })) as string[] | null;
			if (!locations) {
				locations = [...DEFAULT_LOCATIONS];
			}

			if (locations.length === 0) {
				return ctx.reply('No locations configured yet.');
			}
			const text = locations.map((loc) => `- ${loc}`).join('\n');
			await ctx.reply(`Available locations:\n${text}`);
		});

		bot.command('chatid', async (ctx) => {
			await ctx.reply(`Chat ID: ${ctx.chat?.id}`);
		});

		bot.command('add', async (ctx) => {
			if (!ctx.chat) return;
			const key = `locations_${ctx.chat.id}`;

			let locations = (await env.KV.get(key, { type: 'json' })) as string[] | null;
			if (!locations) {
				locations = [...DEFAULT_LOCATIONS];
			}

			const newLocation = ctx.match.trim();
			if (!newLocation) {
				return ctx.reply("Please specify a location to add. Example: /add McDonald's");
			}
			if (locations.includes(newLocation)) {
				return ctx.reply('That location is already in the list!');
			}

			// Add the new location and save to KV
			locations.push(newLocation);
			await env.KV.put(key, JSON.stringify(locations));

			const text = locations.map((loc) => `- ${loc}`).join('\n');
			await ctx.reply(`Added "${newLocation}". Available locations:\n${text}`);
		});

		bot.remove('remove', async (ctx) => {
			if (!ctx.chat) return;
			const key = `locations_${ctx.chat.id}`;

			let locations = (await env.KV.get(key, { type: 'json' })) as string[] | null;
			if (!locations) {
				locations = [...DEFAULT_LOCATIONS];
			}

			const locationToRemove = ctx.match.trim();
			if (!locationToRemove) {
				return ctx.reply("Please specify a location to remove. Example: /remove McDonald's");
			}
			if (!locations.includes(locationToRemove)) {
				return ctx.reply('That location is not in the list!');
			}

			// Remove the location and save to KV
			locations = locations.filter((loc) => loc !== locationToRemove);
			await env.KV.put(key, JSON.stringify(locations));

			const text = locations.map((loc) => `- ${loc}`).join('\n');
			await ctx.reply(`Removed "${locationToRemove}". Available locations:\n${text}`);
		});

		bot.command('help', async (ctx) => {
			const helpText =
				'Commands:\n' +
				'/lunch - pick a random lunch spot\n' +
				'/list - list all configured locations\n' +
				"/chatid - show this chat's ID\n" +
				'/help - show help';
			await ctx.reply(helpText);
		});

		if (request.method === 'GET' && url.pathname === '/') {
			return new Response('Hello! The Worker is running!');
		}

		if (request.method === 'GET' && url.pathname === '/health') {
			return new Response('Health check, everything is OK!');
		}

		if (request.method === 'GET' && url.pathname === '/api/locations') {
			const places = ['Food court', 'Guzman', 'SIT canteen'];
			return new Response(JSON.stringify(places), {
				headers: { 'Content-Type': 'application/json' },
			});
		}

		if (request.method === 'POST' && url.pathname === '/webhook') {
			// Hand the request over to grammY to process the commands
			const handleUpdate = webhookCallback(bot, 'cloudflare-mod');
			return handleUpdate(request);
		}
		return new Response('Endpoint not found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;
