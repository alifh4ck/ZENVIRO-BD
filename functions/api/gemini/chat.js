// Cloudflare Pages Function
// Route: POST /api/gemini/chat
//
// The front-end (jaiCallGemini in index.html) posts:
//   { systemInstruction: string, contents: [{role, parts:[{text}]}], prompt: string }
// and expects back:
//   { success: true, text: string }
// On any failure it falls back to an offline rule-based responder, so this
// endpoint can safely fail (return success:false) without breaking the chat.
//
// Requires a GEMINI_API_KEY environment variable set in the Cloudflare Pages
// project settings (Settings -> Environment variables). The key is only ever
// read on the server here — it is never sent to the browser.

const GEMINI_MODEL = 'gemini-2.5-flash';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return json({ success: false, error: 'GEMINI_API_KEY is not configured on the server.' }, 500);
    }

    const body = await request.json().catch(() => ({}));
    const { systemInstruction, contents, prompt } = body || {};

    const finalContents = Array.isArray(contents) && contents.length
      ? contents
      : (prompt ? [{ role: 'user', parts: [{ text: String(prompt) }] }] : null);

    if (!finalContents) {
      return json({ success: false, error: 'Missing "contents" or "prompt" in request body.' }, 400);
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: finalContents,
        ...(systemInstruction
          ? { system_instruction: { parts: [{ text: String(systemInstruction) }] } }
          : {}),
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => '');
      return json({ success: false, error: `Gemini API error (${geminiRes.status}): ${errText}` }, 502);
    }

    const data = await geminiRes.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();

    if (!text) {
      return json({ success: false, error: 'Gemini API returned no text (possibly blocked by safety filters).' }, 502);
    }

    return json({ success: true, text });
  } catch (err) {
    return json({ success: false, error: String(err && err.message ? err.message : err) }, 500);
  }
}

// Reject non-POST methods explicitly instead of falling through to a 404,
// so the front-end's fetch() gets a clear response either way.
export async function onRequestGet() {
  return json({ success: false, error: 'Use POST for this endpoint.' }, 405);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
