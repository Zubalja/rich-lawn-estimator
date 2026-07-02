// netlify/functions/ai-estimate.js
//
// Called from the browser at /.netlify/functions/ai-estimate
//
// CURRENT SETUP: using Netlify's built-in AI Gateway. No API key or account
// setup needed — Netlify auto-injects a working Anthropic key at runtime,
// and usage is billed through your Netlify credits alongside everything else.
//
// To switch to billing your own Anthropic account directly later:
//   1. Get a key from https://console.anthropic.com/settings/keys
//   2. In Netlify: Project configuration > Environment variables > Add a variable
//      Key: ANTHROPIC_API_KEY   Value: your key
//   3. Trigger a new deploy
// No code changes needed for that switch — this file already falls back to
// calling Anthropic directly whenever ANTHROPIC_API_KEY is set manually.
//
// Model note: using claude-sonnet-5 for quality on photo interpretation.
// To cut cost per request, you can swap the "model" value below to
// "claude-haiku-4-5-20251001" — cheaper, still handles images, slightly
// less nuanced on ambiguous photos.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // Netlify's AI Gateway auto-injects ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL
  // into every function at runtime — no dashboard setup needed, billed through
  // your Netlify credits. If you later add your own ANTHROPIC_API_KEY manually
  // in Project configuration > Environment variables, Netlify stops injecting
  // both of these and this code automatically falls back to calling Anthropic
  // directly, billed to your own Anthropic account instead.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  console.log('[ai-estimate] ANTHROPIC_API_KEY present:', !!apiKey, '| ANTHROPIC_BASE_URL:', process.env.ANTHROPIC_BASE_URL || '(not set, using direct Anthropic)');
  if (!apiKey) {
    console.log('[ai-estimate] No key found in environment — check Team settings > AI enablement, and that this deploy happened AFTER enabling it.');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'No Anthropic key available. Make sure Netlify AI features are enabled for your team, or add your own ANTHROPIC_API_KEY.' }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { images = [], description = '', measuredSqFt = 0 } = payload;
  if (!description.trim() && images.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Add a description or at least one photo.' }) };
  }
  if (images.length > 4) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Please upload 4 photos or fewer.' }) };
  }
  if (!measuredSqFt || measuredSqFt <= 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'A yard measurement is required before using the AI assistant.' }) };
  }

  try {
    // Pull the live pricing catalog from this same site so the AI only ever
    // recommends real, current services — never invents pricing.
    const siteUrl = process.env.URL || process.env.DEPLOY_URL || '';
    console.log('[ai-estimate] Fetching catalog from:', `${siteUrl}/catalog.json`);
    const catalogRes = await fetch(`${siteUrl}/catalog.json`);
    if (!catalogRes.ok) {
      console.log('[ai-estimate] catalog.json fetch failed, status:', catalogRes.status);
    }
    const catalog = await catalogRes.json();
    const catalogForPrompt = catalog.categories.flatMap((c) =>
      c.items.map((i) => ({ item_id: i.id, category: c.name, name: i.name, unit: i.unit, description: i.desc }))
    );

    const promptText = `A homeowner is using a self-service landscaping estimate tool. They measured their yard first, then uploaded photo(s) (if any) and described what they want done.

Their measured yard area: ${measuredSqFt.toLocaleString()} square feet total. Treat this as ground truth for the overall property size — it's more reliable than anything you can judge from a photo. Note that this is the TOTAL yard area, not necessarily the size of any one bed, strip, or patio the homeowner is asking about — use the photo and description to judge what portion of that total area applies to each suggested item, rather than assuming the full number applies to every line item.

Their request: "${description || '(no text description provided, use the photo(s) only)'}"

Here is the full list of services we actually offer, with their internal ids. You may ONLY choose item_id values from this list — never invent a service that isn't here:
${JSON.stringify(catalogForPrompt, null, 2)}

Look at the photo(s) if provided, the request, and the measured total area together. Respond with ONLY valid JSON, no markdown fences, no other text, in exactly this shape:
{
  "summary": "one or two friendly sentences describing what you're proposing, written for the homeowner",
  "suggestions": [
    { "item_id": "id from the list above", "quantity": number, "reason": "short plain-language reason, one sentence" }
  ]
}

Rules:
- Only include items that genuinely fit the request and what's visible in the photo.
- For sqft/lf items, base your quantity on the relevant portion of the measured area plus what's visible in the photo — explain your reasoning briefly in "reason" (e.g. "roughly a third of your measured yard, based on the park strip shown in your photo").
- For "ea" or "day" or "visit" items, use whole, sensible numbers.
- If nothing in the catalog reasonably matches the request, return an empty "suggestions" array and explain why in "summary".
- Do not calculate or mention any dollar amounts — pricing is handled separately.`;

    const content = [{ type: 'text', text: promptText }];
    for (const img of images) {
      if (img && img.data && img.mediaType) {
        content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } });
      }
    }

    console.log('[ai-estimate] Calling:', `${baseUrl}/v1/messages`);
    const anthropicRes = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1200,
        messages: [{ role: 'user', content }],
      }),
    });

    const data = await anthropicRes.json();
    console.log('[ai-estimate] Response status:', anthropicRes.status, '| ok:', anthropicRes.ok);
    if (!anthropicRes.ok) {
      console.log('[ai-estimate] Error body:', JSON.stringify(data));
    }

    if (!anthropicRes.ok) {
      return { statusCode: anthropicRes.status, body: JSON.stringify({ error: data.error?.message || 'AI request failed' }) };
    }

    const textBlock = (data.content || []).find((b) => b.type === 'text');
    let parsed;
    try {
      const clean = (textBlock?.text || '').replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch (e) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not read the AI response. Try again.' }) };
    }

    // Guard: only pass through item_ids that actually exist in the catalog.
    const validIds = new Set(catalogForPrompt.map((i) => i.item_id));
    parsed.suggestions = (parsed.suggestions || []).filter((s) => validIds.has(s.item_id) && s.quantity > 0);

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed) };
  } catch (err) {
    console.log('[ai-estimate] Caught error:', err.message, err.stack);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Something went wrong' }) };
  }
};
