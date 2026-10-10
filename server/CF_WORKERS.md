# Cloudflare Workers deployment

This repository includes a standalone Worker for the ncm-cs11 player. It serves the web UI and implements the player API directly with Fetch; it does not start the Docker API service or require a long-running Node.js process.

The Worker is a player-focused API subset, not a Cloudflare port of the complete NeteaseCloudMusicApi Enhanced project. The VPS/Docker deployment remains available in [`DEPLOY.md`](DEPLOY.md).

## Deploy from the Cloudflare Dashboard

The repository root contains `wrangler.jsonc` and an npm workspace so Cloudflare Builds can install dependencies, find the Worker entry point, and upload `web/` as static assets.

1. Fork this repository to your GitHub account.
2. In Cloudflare, open **Workers & Pages** and choose **Create application → Import a repository**. Select the Worker / Workers Builds flow, not a static Pages project. Connect GitHub and select your fork.
3. Select the `main` branch.
4. Set the Worker name to `ncm-cs11`, matching the `name` in the root `wrangler.jsonc`. If that name is already used in your account, change `name` in `wrangler.jsonc` to the desired unique Worker name before connecting.
5. Set the project root directory to the repository root (leave it blank if the Dashboard represents the root as an empty value or `/`). Do not set it to `server/cf-worker`.
6. Set the build command to:

   ```sh
   npm run test:worker && npm run check:worker
   ```

7. Set the deploy command to:

   ```sh
   npm run deploy:worker
   ```

8. Leave the build output directory empty. Wrangler reads the root `wrangler.jsonc`; it configures the Worker entry, static assets, and `workers.dev` endpoint.
9. Complete the first deployment, then add `GATE_KEY` as an encrypted secret under the Worker **Settings → Variables and Secrets**. Do not add it to a build variable, source file, or repository.
10. Confirm the deployment has a `workers.dev` endpoint under **Settings → Domains & Routes**. If the Dashboard says **No active routes**, enable the `workers.dev` route or attach a custom domain, then deploy again.

Do not use the single-file upload/Quick Edit flow for this project. It does not run the npm workspace build. Use Git integration as above or Wrangler CLI.

## Deploy with Wrangler

Run commands from the repository root:

```sh
npm install
npm run test:worker
npm run check:worker
npm run deploy:worker
```

For local development, create `server/cf-worker/.dev.vars` with a local `GATE_KEY`, then run:

```sh
npm run dev:worker
```

`.dev.vars` is ignored by Git. The Worker fails closed with HTTP 503 when `GATE_KEY` is missing. For a remote deployment, configure the secret in the Dashboard or run:

```sh
npx wrangler secret put GATE_KEY
```

## API coverage

The Worker currently implements the API methods used by the player:

| Player API path | Purpose |
| --- | --- |
| `/api/login/qr/key` | Request a QR login key |
| `/api/login/qr/create` | Create the QR code data |
| `/api/login/qr/check` | Poll QR login and return account cookies |
| `/api/login/status` | Read the account profile |
| `/api/user/playlist` | List the account's playlists |
| `/api/recommend/resource` | Read daily recommended playlists (login required) |
| `/api/recommend/songs` | Read daily recommended songs (login required; supports `afresh=true`) |
| `/api/likelist` | Read liked song IDs |
| `/api/like` | Like or unlike a song |
| `/api/playlist/track/all` | Read tracks in a playlist |
| `/api/search` | Search songs |
| `/api/song/detail` | Read song metadata |
| `/api/song/url/v1` | Request a NetEase playback URL |
| `/api/lyric` | Read lyrics |
| `/api/personal_fm` | Request Personal FM |
| `/api/top/playlist` | Request recommended playlists |

Unknown API paths return JSON 404. The Worker does not forward requests to a separately hosted API Enhanced service and does not provide that project's full endpoint set.

## Known limitations

- Playback URLs come from NetEase. The VPS deployment's third-party unblock integrations are not included.
- Cloudflare's outbound IP is not guaranteed to be in mainland China. The Worker sends compatibility headers, but spoofed `X-Real-IP` / `X-Forwarded-For` values do not change the network egress IP or guarantee that NetEase accepts the request.
- Debug screenshot upload and large file upload routes are disabled.
- API responses and account cookies are returned according to the player contract. Treat the deployment as private: use a strong `GATE_KEY`, keep it secret, and do not share a public instance with other users.
- A successful build only verifies bundling and mocked tests. Verify QR login, account playlists, song lookup, playback and the target Android WebView against the deployed Worker.

## Configuration files

- Root `wrangler.jsonc`: Dashboard/CLI deployment config, `workers.dev`, and `web/` assets binding.
- Root `package.json`: npm workspace and repeatable test, dry-run, development and deployment commands.
- `server/cf-worker/index.mjs`: gate, static asset routing and Worker entry point.
- `server/cf-worker/ncm-api.mjs`: Fetch-based NetEase API implementation.
- `server/cf-worker/worker.test.mjs`: offline unit tests with mocked upstream responses.
