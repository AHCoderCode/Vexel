export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, history, images } = req.body;

  if (!prompt && (!images || images.length === 0)) {
    return res.status(400).json({ error: 'Prompt or at least one image is required' });
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: { message: 'Server configuration error' } });

  const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';

  try {
    // Build parts for the current user message
    const currentParts = [];
    if (prompt) currentParts.push({ text: prompt });
    if (images && Array.isArray(images)) {
      images.forEach(img => {
        currentParts.push({
          inline_data: {
            mime_type: img.mimeType,
            data: img.data
          }
        });
      });
    }

    // Build contents array from history (previous turns) + current user message
    let contents = Array.isArray(history) ? [...history] : [];
    contents.push({ role: 'user', parts: currentParts });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      }
    );

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.status(200).json(data);
  } catch (error) {
    console.error('Gemini API error:', error);
    res.status(500).json({ error: { message: error.message } });
  }
}
