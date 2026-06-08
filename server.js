// SMS <-> Claude two-way bot
// Text your Twilio number, Claude replies. Plus a /send endpoint for proactive texts.

import express from "express";
import twilio from "twilio";
import Anthropic from "@anthropic-ai/sdk";

const {
  ANTHROPIC_API_KEY,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER,   // your Twilio number, e.g. +18885551234
  OWNER_NUMBER,         // your personal cell, e.g. +13105557788 (only this number is allowed)
  SEND_SECRET,          // a random string you pick, protects the /send endpoint
  CLAUDE_MODEL = "claude-sonnet-4-6",
  PORT = 3000,
} = process.env;

// --- sanity checks so you get a clear warning instead of a silent failure ---
for (const [k, v] of Object.entries({
  ANTHROPIC_API_KEY,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER,
  OWNER_NUMBER,
})) {
  if (!v) console.warn(`[warn] missing env var: ${k}`);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

const app = express();
app.use(express.urlencoded({ extended: false })); // Twilio posts form-encoded
app.use(express.json());

// --- conversation memory (in-memory, keyed by phone number) ---
// Resets if the server restarts. Good enough to start; swap for a DB later for persistence.
const HISTORY_LIMIT = 20; // keep last 20 turns per number
const conversations = new Map();

function getHistory(num) {
  if (!conversations.has(num)) conversations.set(num, []);
  return conversations.get(num);
}

function pushTurn(num, role, content) {
  const h = getHistory(num);
  h.push({ role, content });
  while (h.length > HISTORY_LIMIT) h.shift();
}

const SYSTEM_PROMPT = `You are Bryan's personal assistant, reachable by text message.
Bryan runs the Divine Ecosystem of fitness/wellness brands. You help him stay accountable,
capture quick notes and reminders, answer questions, and send recaps.

Style rules for SMS:
- Be concise. Texts, not essays. Usually 1-4 short sentences.
- No markdown, no bullet symbols, no headers. Plain text only.
- Warm, direct, a little motivating. Talk like a sharp accountability partner.
- If he logs something (a workout, a win, a task), acknowledge it briefly and reflect it back.
- If you genuinely need more info, ask one short question.`;

async function askClaude(fromNumber, userText) {
  pushTurn(fromNumber, "user", userText);
  const messages = getHistory(fromNumber);

  const resp = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages,
  });

  const reply =
    resp.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim() || "(no reply)";

  pushTurn(fromNumber, "assistant", reply);
  return reply;
}

// --- inbound SMS webhook (point Twilio here) ---
app.post("/sms", async (req, res) => {
  const from = req.body.From;
  const body = (req.body.Body || "").trim();
  const twiml = new twilio.twiml.MessagingResponse();

  // Security: only respond to your own number, so randoms can't burn your API credits.
  if (OWNER_NUMBER && from !== OWNER_NUMBER) {
    console.log(`[blocked] message from non-owner ${from}`);
    res.type("text/xml").send(twiml.toString()); // silent no-reply
    return;
  }

  try {
    const reply = await askClaude(from, body);
    twiml.message(reply);
  } catch (err) {
    console.error("[error] askClaude failed:", err);
    twiml.message("Hit an error reaching Claude. Try again in a sec.");
  }

  res.type("text/xml").send(twiml.toString());
});

// --- proactive send endpoint (for scheduled accountability/recap texts) ---
// POST /send  { "secret": "...", "text": "Morning Bryan, did you train today?" }
// Optional "to" defaults to OWNER_NUMBER.
app.post("/send", async (req, res) => {
  const { secret, text, to } = req.body || {};
  if (!SEND_SECRET || secret !== SEND_SECRET) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (!text) return res.status(400).json({ error: "missing text" });

  try {
    const msg = await twilioClient.messages.create({
      from: TWILIO_FROM_NUMBER,
      to: to || OWNER_NUMBER,
      body: text,
    });
    res.json({ ok: true, sid: msg.sid });
  } catch (err) {
    console.error("[error] send failed:", err);
    res.status(500).json({ error: String(err) });
  }
});

// --- health check ---
app.get("/", (_req, res) => res.send("SMS-Claude bot is running."));

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
