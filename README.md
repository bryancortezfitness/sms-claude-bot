# SMS <-> Claude Bot

Text a phone number, Claude texts back. Two-way. Plus a `/send` endpoint so
scheduled jobs can fire proactive accountability/recap texts to you.

You'll do this once. Budget ~20 minutes. Total cost: ~$1.15/mo for the number
plus pennies per text and a little API usage.

---

## What you need to collect (the 3 things you paste in)

1. **Anthropic API key** — from console.anthropic.com
2. **Twilio Account SID + Auth Token + a phone number** — from console.twilio.com
3. **A SEND_SECRET** — any random string you invent (e.g. mash the keyboard)

Keep them in a note as you go. You'll paste them into Render at the end.

---

## Step 1 — Anthropic API key

1. Go to https://console.anthropic.com
2. Log in. Click **API Keys** (left sidebar) -> **Create Key**.
3. Name it `sms-bot`, copy the key (starts with `sk-ant-`). Save it.
4. Make sure the account has some credit: **Billing** -> add ~$5 to start.

---

## Step 2 — Twilio account + phone number

1. Go to https://www.twilio.com/try-twilio and sign up (free trial gives you credit).
2. Verify your email and your personal cell when prompted.
3. On the Console home (https://console.twilio.com), under **Account Info**, copy:
   - **Account SID** (starts with `AC...`)
   - **Auth Token** (click to reveal)
   Save both.
4. Buy a number: left menu **Phone Numbers** -> **Manage** -> **Buy a number**.
   - Check the **SMS** capability box, pick any US local number, **Buy** (~$1.15/mo).
   - Save the number in E.164 format, e.g. `+18885551234`.

> Trial note: on a trial account you can only text **verified** numbers. Your own
> cell gets verified during signup, so texting yourself works immediately. Upgrade
> the account (add a card) when you want to remove the trial banner / limits.

---

## Step 3 — Put the code on GitHub

Render deploys from a Git repo. Easiest path:

1. Create a free GitHub account if you don't have one: https://github.com
2. Create a new **private** repo named `sms-claude-bot`.
3. Upload these files into it (drag-and-drop works):
   `server.js`, `package.json`, `render.yaml`, `.env.example`, `.gitignore`, `README.md`
   - GitHub: **Add file** -> **Upload files** -> drag them in -> **Commit changes**.

(If you use the GitHub Desktop app or git CLI instead, just commit and push these files.)

---

## Step 4 — Deploy on Render (the always-on host)

1. Go to https://render.com and sign up with your GitHub account.
2. Click **New** -> **Blueprint**.
3. Connect the `sms-claude-bot` repo. Render reads `render.yaml` and proposes the service. Click **Apply**.
4. It will ask for the environment variables marked `sync: false`. Paste:
   - `ANTHROPIC_API_KEY` = your `sk-ant-...` key
   - `TWILIO_ACCOUNT_SID` = your `AC...` SID
   - `TWILIO_AUTH_TOKEN` = your auth token
   - `TWILIO_FROM_NUMBER` = your Twilio number, e.g. `+18885551234`
   - `OWNER_NUMBER` = your personal cell, e.g. `+13105557788`
   - `SEND_SECRET` = your random string
   (`CLAUDE_MODEL` is already set to `claude-sonnet-4-6`.)
5. Click **Create** / **Deploy**. Wait for the log to show `Listening on port ...`.
6. Copy your service URL from the top of the page, e.g. `https://sms-claude-bot.onrender.com`.

> Free plan caveat: Render free services sleep after ~15 min idle and take a few
> seconds to wake. First text after a quiet stretch may take ~20-30s to reply.
> Upgrade to the $7/mo Starter plan to keep it always-awake if that bugs you.

---

## Step 5 — Point Twilio at your server

1. In Twilio Console: **Phone Numbers** -> **Manage** -> **Active numbers** -> click your number.
2. Scroll to **Messaging Configuration** -> "A message comes in".
3. Set **Webhook**, method **HTTP POST**, URL:
   `https://YOUR-RENDER-URL.onrender.com/sms`
4. **Save**.

---

## Step 6 — Test it

Text your Twilio number from your cell: **"hey, you there?"**
You should get a reply within a few seconds (longer on the first cold-start text).

If nothing comes back, see Troubleshooting below.

---

## Proactive texts (accountability nudges, recaps)

Your server exposes `POST /send`. Anything that can make an HTTP request can now
text you. Example with curl:

```
curl -X POST https://YOUR-RENDER-URL.onrender.com/send \
  -H "Content-Type: application/json" \
  -d '{"secret":"YOUR_SEND_SECRET","text":"Morning Bryan. Did you train today? Reply Y/N."}'
```

To make it automatic (e.g. 6am every day), use any free scheduler:
- **cron-job.org** (free): create a job, method POST, your `/send` URL, JSON body as above.
- or a GitHub Action on a schedule, or Render's own Cron Jobs.

Tell Claude in the app what you want texted and when, and it can generate the
exact scheduler config for you.

---

### Bonus: kill the cold-start for free
Render free services sleep after 15 min. Add a second cron-job.org job that does a
**GET** to your base URL (`https://YOUR-RENDER-URL.onrender.com/`) every 10-14 minutes.
That keeps the service warm, so your texts reply instantly instead of after a 30s wake-up.

---

## Troubleshooting

- **No reply at all:** Check Render logs (Dashboard -> your service -> Logs). Look for
  `Listening on port`. If you see `[blocked] message from non-owner`, your
  `OWNER_NUMBER` doesn't match the number you texted from (must be exact E.164, e.g. `+1...`).
- **"Hit an error reaching Claude":** Bad/empty `ANTHROPIC_API_KEY` or no API credit.
- **Twilio error 11200 / 502:** Render service was asleep or the webhook URL is wrong.
  Confirm the URL ends in `/sms` and the service is live.
- **Trial: "can't send to unverified number":** Verify the recipient in Twilio, or upgrade the account.

---

## Local testing (optional)

```
cp .env.example .env   # fill in real values
npm install
npm start              # server on http://localhost:3000
```
Use ngrok (`ngrok http 3000`) to expose it and point Twilio at the ngrok `/sms` URL.
