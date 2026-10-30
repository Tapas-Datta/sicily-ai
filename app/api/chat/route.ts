import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
  timeout: 60_000,
  maxRetries: 1,
});

export async function POST(req: Request) {
  if (!process.env.GROQ_API_KEY) {
    return Response.json({ error: "GROQ_API_KEY is missing." }, { status: 500 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  if (!body || !Array.isArray(body.messages)) {
    return Response.json({ error: "Messages array is required." }, { status: 400 });
  }

  const messages = body.messages.map((m: any) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: typeof m.content === "string" ? m.content : "",
  }));

  // Direct check for national anthem queries to ensure absolute accuracy and zero markdown
  const lastUserMessage = messages.filter((m: any) => m.role === "user").pop()?.content?.toLowerCase() || "";
  
  if (
    lastUserMessage.includes("national anthem") || 
    lastUserMessage.includes("natinal song") || 
    lastUserMessage.includes("amar shonar bangla")
  ) {
    const directAnthemInfo = `The national anthem of Bangladesh is Amar Shonar Bangla. It was written and composed by Rabindranath Tagore in 1905.`;

    const encoder = new TextEncoder();
    const customStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(directAnthemInfo));
        controller.close();
      }
    });

    return new Response(customStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  try {
    const result = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You are Sicily, an advanced, intelligent, and proactive AI assistant built with Next.js, created and founded by Tapas Datta (Email: taposdatta610@gmail.com, LinkedIn: https://www.linkedin.com/feed/). Always reply in English. STRICT FORMATTING RULE: NEVER, UNDER ANY CIRCUMSTANCES, USE ASTERISKS (*), BOLD MARKERS (**), OR ANY MARKDOWN SYMBOLS IN YOUR RESPONSES. Output raw plain text only. When asked who your founder/creator is, ONLY mention Tapas Datta, his email, and his LinkedIn profile without adding unrelated facts.",
        },
        ...messages,
      ],
      stream: true,
      max_completion_tokens: 2048,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of result) {
            let content = chunk.choices[0]?.delta?.content || "";
            // Strip out any accidental asterisks or markdown symbols from the stream
            content = content.replace(/[*_#`~]/g, "");
            if (content) {
              controller.enqueue(encoder.encode(content));
            }
          }
          controller.close();
        } catch (error) {
          console.error("Streaming error:", error);
          controller.enqueue(encoder.encode("\n\n[AI response interrupted. Please try again.]"));
          controller.close();
        }
      },
      cancel() {}
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: any) {
    console.error("Groq API error:", error);
    return Response.json({ error: error.message || "AI server error occurred." }, { status: 502 });
  }
}