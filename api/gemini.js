export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, history, image } = req.body;

  if (!prompt && !image) {
    return res.status(400).json({ error: 'Prompt or Image is required' });
  }

  // 🔐 Read the API key from Vercel Environment Variables
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!API_KEY) {
    console.error('❌ GEMINI_API_KEY is not set in environment variables');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Using gemini-1.5-flash as 3.6 does not exist and 1.5 supports text, images, and history.
  const MODEL = 'gemini-3.6-flash'; 

  try {
    // 1. Build the current message parts
    let currentParts = [];
    if (prompt) {
      currentParts.push({ text: prompt });
    }
    if (image) {
      currentParts.push({
        inline_data: {
          mime_type: image.mimeType,
          data: image.data
        }
      });
    }

    // 2. Combine previous history with the new message
    // If no history exists, default to empty array
    let contents = Array.isArray(history) ? history : [];
    
    // 3. Append the newest message
    contents.push({
      role: 'user',
      parts: currentParts
    });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: contents
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Forward the entire response back to the frontend
    res.status(200).json(data);
  } catch (error) {
    console.error('Gemini API error:', error);
    res.status(500).json({ error: error.message });
  }
}
