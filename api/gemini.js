export default async function handler(req, res) {

// Only accept POST requests

if (req.method !== 'POST') {

return res.status(405).json({ error: 'Method not allowed' });

}



const { prompt } = req.body;



if (!prompt) {

return res.status(400).json({ error: 'Prompt is required' });

}



// 🔐 Read the API key from Vercel Environment Variables

const API_KEY = process.env.GEMINI_API_KEY;



if (!API_KEY) {

console.error('❌ GEMINI_API_KEY is not set in environment variables');

return res.status(500).json({ error: 'Server configuration error' });

}



// You can change the model here if you want

const MODEL = 'gemini-1.5-flash'; // or 'gemini-1.5-pro'



try {

const response = await fetch(

`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,

{

method: 'POST',

headers: { 'Content-Type': 'application/json' },

body: JSON.stringify({

contents: [{ parts: [{ text: prompt }] }]

})

}

);



const data = await response.json();



// Forward the entire response back to the frontend

res.status(200).json(data);

} catch (error) {

console.error('Gemini API error:', error);

res.status(500).json({ error: error.message });

}

}

