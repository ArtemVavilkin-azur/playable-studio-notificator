// Slack Workflow webhook: не больше 1 запроса в секунду
const SEND_INTERVAL_MS = 1100;
const MAX_ATTEMPTS = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toMessages(payload) {
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  if (!attachments.length) {
    return [{ text: payload.text ?? "", description: "", link: "" }];
  }
  return attachments.map((a) => ({
    text: payload.text ?? "",
    description: a.title ?? "",
    link: a.title_link ?? "",
  }));
}

async function send(url, msg) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg),
    });
    if (res.status !== 429) {
      if (!res.ok) console.error(`Forward failed ${res.status}: ${await res.text()}`);
      return;
    }
    const retryAfter = Number(res.headers.get("Retry-After")) || 1;
    await sleep(retryAfter * 1000);
  }
  console.error("Forward failed: rate limited");
}

async function sendAll(url, messages) {
  for (let i = 0; i < messages.length; i++) {
    if (i > 0) await sleep(SEND_INTERVAL_MS);
    await send(url, messages[i]);
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    if (!env.TARGET_URL) {
      return new Response("TARGET_URL secret is not set", { status: 500 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    // Отправляем в фоне, чтобы GlitchTip не ждал пауз между запросами
    ctx.waitUntil(sendAll(env.TARGET_URL, toMessages(payload)));
    return new Response("OK");
  },
};
