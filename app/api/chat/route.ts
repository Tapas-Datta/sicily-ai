
import Groq from "groq-sdk";

export async function POST(req: Request) {
  try {
    // Check API key
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: "GROQ_API_KEY is missing. Check your .env.local file." },
        { status: 500 }
      );
    }

    // Initialize Groq
    const groq = new Groq({
      apiKey,
      timeout: 60_000,
      maxRetries: 1,
    });

    // Read request body
    let body: any;

    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: "Invalid JSON request." },
        { status: 400 }
      );
    }

    if (!body || !Array.isArray(body.messages)) {
      return Response.json(
        { error: "Messages array is required." },
        { status: 400 }
      );
    }

    // Prepare messages
    const messages = body.messages.map((m: any) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: typeof m.content === "string" ? m.content : "",
    }));

    // Bangladesh National Anthem special response
    const lastUserMessage =
      messages
        .filter((m: any) => m.role === "user")
        .pop()?.content?.toLowerCase() || "";

    if (
      lastUserMessage.includes("national anthem") ||
      lastUserMessage.includes("natinal song") ||
      lastUserMessage.includes("amar shonar bangla")
    ) {
      const answer =
        "The national anthem of Bangladesh is Amar Shonar Bangla. It was written and composed by Rabindranath Tagore in 1905.";

      return new Response(answer, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
        },
      });
    }

    // Groq AI request
    const result = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",

      messages: [
        {
          role: "system",
          content:
            "You are Tapas_AI, an advanced, intelligent and helpful AI assistant created by Tapas Datta. Always reply in English. Use clear and natural language. Avoid unnecessary markdown symbols. When asked who created you, mention Tapas Datta, his email taposdatta610@gmail.com, and his LinkedIn profile https://www.linkedin.com/feed/.",
        },
        ...messages,
      ],

      stream: true,
      max_completion_tokens: 2048,
    });

    // Stream response
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of result) {
            let content =
              chunk.choices[0]?.delta?.content || "";

            content = content.replace(/[*_#`~]/g, "");

            if (content) {
              controller.enqueue(encoder.encode(content));
            }
          }

          controller.close();

        } catch (error) {
          console.error("Groq streaming error:", error);

          controller.enqueue(
            encoder.encode(
              "\n\n[AI response interrupted. Please try again.]"
            )
          );

          controller.close();
        }
      },

      cancel() {},
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    });

  } catch (error: any) {
    console.error("Tapas_AI backend error:", error);

    return Response.json(
      {
        error:
          error?.message ||
          "AI server error occurred. Please try again.",
      },
      { status: 502 }
    );
  }
}
