// api/chat.js
import OpenAI from 'openai';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'No messages provided' });
    }

    // Extract the latest user message for the search query
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) {
      return res.status(400).json({ error: 'No user message found' });
    }
    const query = lastUserMsg.content.trim();
    if (!query) {
      return res.status(400).json({ error: 'Empty query' });
    }

    // 1. Perform Brave Search
    const braveApiKey = process.env.BRAVE_SEARCH_API_KEY;
    if (!braveApiKey) {
      throw new Error('BRAVE_SEARCH_API_KEY is not set');
    }

    const searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
    const searchRes = await fetch(searchUrl, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': braveApiKey
      },
      signal: AbortSignal.timeout(8000) // 8s timeout
    });

    if (!searchRes.ok) {
      throw new Error(`Brave Search error: ${searchRes.status}`);
    }

    const searchData = await searchRes.json();
    const rawResults = searchData.web?.results || [];
    const sources = rawResults.slice(0, 5).map(r => ({
      title: r.title || 'Untitled',
      url: r.url,
      snippet: r.description || ''
    }));

    if (sources.length === 0) {
      return res.status(200).json({
        answer: "I couldn't find any relevant web results for that query. Please try rephrasing.",
        sources: [],
        confidence: 'low'
      });
    }

    // 2. Build prompt for OpenAI
    const searchResultsText = sources
      .map((s, i) => `[${i + 1}] ${s.title}\n${s.snippet}\nURL: ${s.url}`)
      .join('\n\n');

    const systemPrompt = `You are Vexel AI, an assistant that answers questions using provided web search results.
Today's date: ${new Date().toISOString().split('T')[0]}.
Rules:
- Answer the user's latest query using the search results below.
- Cite sources using the format [1], [2], etc.
- If results are insufficient, say so clearly.
- Be concise and helpful.
- Do not invent information outside the search results.

Search results:
${searchResultsText}`;

    // Prepare messages for OpenAI (system + conversation)
    const openaiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages // user/assistant history
    ];

    // 3. Call OpenAI
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: openaiMessages,
      temperature: 0.3,
      max_tokens: 800
    });

    const answer = completion.choices[0]?.message?.content || 'I could not generate an answer.';

    return res.status(200).json({
      answer,
      sources,
      confidence: 'high'
    });

  } catch (error) {
    console.error('Chat error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
}
