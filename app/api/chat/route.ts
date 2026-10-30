import Groq from "groq-sdk";

export const runtime = "nodejs";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "",
});

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: "Groq API key is missing in environment variables." },
        { status: 500 }
      );
    }

    // Visitor Tracking Info
    const ip = request.headers.get("x-forwarded-for") || "Unknown IP";
    const city = request.headers.get("x-vercel-ip-city") || "Unknown City";
    const country = request.headers.get("x-vercel-ip-country") || "Unknown Country";
    console.log(`[VISITOR TRACKER] IP: ${ip} | Location: ${city}, ${country}`);

    const body = await request.json();
    const messages = body.messages as ChatMessage[];
    const username =
      typeof body.username === "string" ? body.username.slice(0, 50) : "Guest";

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "Messages are required." }, { status: 400 });
    }

    const recentMessages = messages.slice(-30);

    // Custom handler for national anthem queries
    const lastUserMessage =
      recentMessages.filter((m) => m.role === "user").pop()?.content?.toLowerCase() || "";

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
        },
      });

      return new Response(customStream, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: [
        {
          role: "system",
          content: `You are Sicily, an advanced, intelligent, and proactive AI assistant built with Next.js, created and founded by Tapas Datta (Email: taposdatta610@gmail.com, LinkedIn: https://www.linkedin.com/feed/). The current visitor's name is ${username}. Address them warmly. Adapt your language to match the user. If the user speaks or asks in Bangla, reply fluently and naturally in Bangla. If they speak English, reply in English. When asked about your creator, founder, or owner, introduce Tapas Datta in a warm, friendly way, naturally sharing his name, email, and LinkedIn profile. STRICT FORMATTING RULE: NEVER, UNDER ANY CIRCUMSTANCES, USE ASTERISKS (*), BOLD MARKERS (**), OR ANY MARKDOWN SYMBOLS IN YOUR RESPONSES. Output raw plain text only.`,
        },
        ...recentMessages,
      ],
      temperature: 0.7,
      stream: true,
      max_completion_tokens: 2048,
    });

    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of completion as any) {
            const content = chunk.choices[0]?.delta?.content || "";
            const cleanContent = content.replace(/[*_#`~]/g, "");

            if (cleanContent.length > 0) {
              controller.enqueue(encoder.encode(cleanContent));
            }
          }

          controller.close();
        } catch (error) {
          console.error("Groq Streaming Error:", error);
          controller.error(error as any);
        }
      },
    });

    return new Response(readableStream, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: any) {
    console.error("Groq API Error:", error);

    const friendlyMessage =
      "I am receiving a bit too many requests right now. Please give me a minute or two to catch my breath and try again!";
    return new Response(friendlyMessage, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}