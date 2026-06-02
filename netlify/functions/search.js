const https = require('https');

exports.handler = async function (event) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let city;
  try {
    const body = JSON.parse(event.body || '{}');
    city = (body.city || '').trim();
  } catch {
    return { statusCode: 400, body: 'Invalid JSON body' };
  }

  if (!city) {
    return { statusCode: 400, body: 'Missing city parameter' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: 'API key not configured' };
  }

  const prompt = `You are a nightlife expert. Return information about the best bars, clubs, and nightlife venues in ${city}.

CRITICAL: Respond with ONLY raw JSON. No markdown, no code fences, no explanation. Just the JSON object.

Return this exact structure:
{
  "summary": "2-3 sentence overview of the nightlife scene in ${city}",
  "sources": ["timeout.com", "yelp.com"],
  "venues": [
    {
      "name": "Venue Name",
      "type": "Club | Bar | Rooftop Bar | Lounge | Dive Bar",
      "neighborhood": "Neighborhood name",
      "price": "$ | $$ | $$$ | $$$$",
      "description": "2-3 sentence vibe description",
      "getting_in": {
        "difficulty": "easy | medium | hard | vip",
        "difficulty_label": "Easy | Moderate | Hard to Get In | VIP Only",
        "dots": 1,
        "tip": "Short practical tip about getting in"
      },
      "age_id": "One sentence about age enforcement and ID strictness",
      "stay_or_hop": {
        "type": "stay | hop | either",
        "tip": "One sentence explaining why"
      },
      "hours": "Thu–Sat 9pm–3am",
      "rating": "4.2",
      "website": "https://example.com",
      "tags": ["Upscale", "EDM", "Dance Floor"]
    }
  ]
}

Rules:
- Include 5-7 venues with a mix: at least one upscale club, one mid-range bar, one dive bar/budget spot, one rooftop or unique venue
- dots: 1=very easy, 2=easy, 3=moderate, 4=hard, 5=vip/nearly impossible
- Use real venue names and accurate information for ${city}
- ONLY output raw JSON, nothing else`;

  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }]
  });

  try {
    const responseText = await new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'api.anthropic.com',
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Length': Buffer.byteLength(requestBody)
          }
        },
        res => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => resolve(data));
        }
      );
      req.on('error', reject);
      req.write(requestBody);
      req.end();
    });

    const apiResponse = JSON.parse(responseText);

    if (apiResponse.error) {
      console.error('Anthropic API error:', apiResponse.error);
      return { statusCode: 500, body: JSON.stringify({ error: apiResponse.error.message }) };
    }

    let content = apiResponse.content[0].text;

    // Strip any accidental markdown code fences
    content = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    // Parse and re-serialize to validate JSON
    const parsed = JSON.parse(content);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(parsed)
    };
  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error: ' + err.message })
    };
  }
};
