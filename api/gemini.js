export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: { code: "METHOD_NOT_ALLOWED", message: "Use POST to send a chat message." }
    });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const history = Array.isArray(body.history) ? body.history : [];
  const images = Array.isArray(body.images) ? body.images : [];

  if (!prompt && images.length === 0) {
    return res.status(400).json({
      error: { code: "EMPTY_PROMPT", message: "Write a message or attach an image first." }
    });
  }

  if (prompt.length > 100000) {
    return res.status(413).json({
      error: { code: "PROMPT_TOO_LONG", message: "That message is too long. Please split it into smaller messages." }
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not configured in the deployment environment.");
    return res.status(500).json({
      error: { code: "SERVER_CONFIGURATION", message: "Vexel's AI service is not configured yet. The site owner needs to check the GEMINI_API_KEY environment variable in Vercel." }
    });
  }

  const primaryModel = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.8-flash";
  const models = [...new Set([primaryModel, fallbackModel])];

  // Send only earlier turns as history. This endpoint adds the current user turn once below.
  const contents = history.slice(-32).flatMap((turn) => {
    if (!turn || !["user", "model"].includes(turn.role) || !Array.isArray(turn.parts)) return [];
    const parts = turn.parts.flatMap((part) => {
      if (part && typeof part.text === "string" && part.text.length) {
        return [{ text: part.text.slice(0, 50000) }];
      }
      const image = part?.inline_data || part?.inlineData;
      if (image && typeof image.data === "string" && typeof image.mime_type === "string" &&
          /^image\/(png|jpeg|webp|gif)$/i.test(image.mime_type)) {
        return [{ inline_data: { mime_type: image.mime_type, data: image.data } }];
      }
      return [];
    });
    return parts.length ? [{ role: turn.role, parts }] : [];
  });

  const currentParts = [];
  if (prompt) currentParts.push({ text: prompt });
  for (const image of images.slice(0, 6)) {
    const mimeType = typeof image?.mimeType === "string" ? image.mimeType : "";
    const data = typeof image?.data === "string" ? image.data : "";
    if (/^image\/(png|jpeg|webp|gif)$/i.test(mimeType) && data.length && data.length <= 12000000) {
      currentParts.push({ inline_data: { mime_type: mimeType, data } });
    }
  }

  if (!currentParts.length) {
    return res.status(400).json({
      error: { code: "INVALID_ATTACHMENT", message: "Vexel could not read that attachment. Please use a PNG, JPG, WebP, or GIF image." }
    });
  }

  // Crucially, the frontend sends only prior turns; append the current turn exactly once.
  contents.push({ role: "user", parts: currentParts });

  let lastStatus = 503;
  let lastFailure = null;

  for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
    const model = models[modelIndex];
    // Retry the configured primary model once; use one bounded fallback attempt to avoid long serverless hangs.
    const tries = modelIndex === 0 ? 2 : 1;

    for (let attempt = 0; attempt < tries; attempt++) {
      let response;
      let data;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
          response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": apiKey
              },
              signal: controller.signal,
              body: JSON.stringify({
                contents,
                generationConfig: { temperature: 0.7 }
              })
            }
          );
        } finally {
          clearTimeout(timeoutId);
        }

        data = await response.json().catch(() => ({}));
        if (response.ok) return res.status(200).json(data);

        const details = data?.error || {};
        const detailText = String(details.message || "").toLowerCase();
        const isQuotaExhausted =
          /billing|daily quota|per day|monthly quota|quota exceeded|exceeded your current quota|limit: 0/.test(detailText);
        const isTransient =
          response.status === 429 || response.status === 500 ||
          response.status === 502 || response.status === 503 ||
          response.status === 504 ||
          /temporarily unavailable|overloaded|try again later|spike/.test(detailText);

        lastStatus = response.status;
        lastFailure = { model, status: response.status, detailText, details };

        // A real account/billing quota cannot be repaired by hammering the same endpoint.
        if (isQuotaExhausted) {
          return res.status(429).json({
            error: {
              code: "AI_QUOTA_EXHAUSTED",
              message: "Vexel has reached the AI provider's current usage quota. This is not a problem with your message. Please try later; the site owner may need to review the Gemini API quota or billing limits.",
              retryable: false
            }
          });
        }

        // Retry transient rate limits or provider overload, then try the fallback model.
        if (isTransient) {
          if (attempt < tries - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * (2 ** attempt)));
            continue;
          }
          break;
        }

        const looksLikeModelProblem =
          response.status === 400 &&
          /model|not found|not supported|does not exist/.test(detailText);
        if (looksLikeModelProblem && modelIndex < models.length - 1) break;

        console.error("Gemini request failed", {
          model,
          status: response.status,
          code: details.status || details.code || "UNKNOWN"
        });
        return res.status(response.status >= 400 && response.status < 500 ? response.status : 502).json({
          error: {
            code: "AI_REQUEST_FAILED",
            message: response.status === 401 || response.status === 403
              ? "Vexel could not authenticate with the AI provider. The site owner needs to check the Gemini API key and project permissions."
              : "Vexel could not process that request. Please check the message and try again.",
            retryable: false
          }
        });
      } catch (error) {
        const timedOut = error?.name === "AbortError";
        lastStatus = timedOut ? 504 : 503;
        lastFailure = { model, status: lastStatus, detailText: String(error?.message || "") };

        if (attempt < tries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (2 ** attempt)));
          continue;
        }
        break;
      }
    }
  }

  console.error("Gemini models unavailable after retry/fallback:", {
    status: lastStatus,
    model: lastFailure?.model
  });
  return res.status(503).json({
    error: {
      code: "AI_TEMPORARILY_UNAVAILABLE",
      message: "Vexel's AI provider is temporarily busy. Your message is still here—please wait a moment and try again. If this keeps happening, the site owner should check the Gemini API quota and service status.",
      retryable: true
    }
  });
}
