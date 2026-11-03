// Runs on Cloudflare. Keys come from secrets (GEMINI_API_KEY, PIXABAY_KEY), never from this file.
const MODEL = 'gemini-flash-latest';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      // 1. AI script writer (Gemini)
      if (url.pathname === '/api/script' && request.method === 'POST') {
        const { topic } = await request.json();
        if (!topic) return json({ error: 'Missing topic' }, 400);
        const prompt =
          'Write a punchy short-video script about: ' + topic +
          '. Return ONLY a JSON array of 6 to 8 strings, one per scene. ' +
          'Each string is under 14 words. The first string is a strong hook.';
        const res = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': env.GEMINI_API_KEY
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json' }
            })
          }
        );
        const data = await res.json();
        if (!res.ok) return json({ error: data.error?.message || 'Gemini error' }, 502);
        const lines = JSON.parse(data.candidates[0].content.parts[0].text);
        return json({ lines });
      }

      // 2. Free stock video clips (Pixabay)
      if (url.pathname === '/api/clips') {
        const q = url.searchParams.get('q') || 'nature';
        const n = Math.min(10, Math.max(3, Number(url.searchParams.get('n')) || 6));
        const res = await fetch(
          'https://pixabay.com/api/videos/?key=' + env.PIXABAY_KEY +
          '&q=' + encodeURIComponent(q) + '&per_page=' + n + '&safesearch=true'
        );
        const data = await res.json();
        const urls = (data.hits || []).map((h) => (h.videos.small || h.videos.tiny || h.videos.medium).url);
        return json({ urls });
      }

      // 3. Media proxy, so the browser can record the clips (Pixabay only)
      if (url.pathname === '/api/media') {
        const target = new URL(url.searchParams.get('u'));
        if (target.hostname !== 'cdn.pixabay.com') return new Response('Blocked', { status: 400 });
        const res = await fetch(target);
        return new Response(res.body, {
          headers: { 'Content-Type': res.headers.get('Content-Type') || 'video/mp4' }
        });
      }
    } catch (err) {
      return json({ error: String(err) }, 500);
    }
    return env.ASSETS.fetch(request);
  }
};
