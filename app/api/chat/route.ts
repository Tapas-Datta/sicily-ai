
import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

const MODEL = "openai/gpt-oss-20b";

const LIMIT_MESSAGE = `I'm taking a little break right now! 😊

I've reached my temporary usage limit. Please come back in a little while. Your conversation is safe!

Thank you from Tapas for your understanding.`;

// UUID validation
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Save chat history securely on the server
async function saveChatHistory(
  visitorId: string,
  conversationId: string,
  userMessage: string,
  aiResponse: string
): Promise<boolean> {
  console.log("SUPABASE SAVE STARTED");

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error(
        "SUPABASE ERROR: Environment variables are missing."
      );
      return false;
    }

    if (
      !visitorId.trim() ||
      !uuidPattern.test(conversationId) ||
      !userMessage.trim() ||
      !aiResponse.trim()
    ) {
      console.error("SUPABASE ERROR: Invalid chat data.", {
        hasVisitorId: Boolean(visitorId),
        validConversationId: uuidPattern.test(conversationId),
        hasUserMessage: Boolean(userMessage.trim()),
        hasAiResponse: Boolean(aiResponse.trim()),
      });

      return false;
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data, error } = await supabase
      .from("chat_history")
      .insert({
        visitor_id: visitorId,
        conversation_id: conversationId,
        user_message: userMessage,
        ai_response: aiResponse,
      })
      .select("id");

    if (error) {
      console.error(
        "SUPABASE INSERT FAILED:",
        error.message
      );

      return false;
    }

    console.log("SUPABASE INSERT SUCCESS:", {
      saved: Boolean(data?.length),
    });

    return true;

  } catch (error) {
    console.error("SUPABASE SAVE EXCEPTION:", error);
    return false;
  }
}

// Check whether the error is a usage or rate limit
function isUsageLimitError(error: any): boolean {
  const status =
    error?.status ||
    error?.statusCode ||
    error?.response?.status;

  const message = String(
    error?.message ||
    error?.error?.message ||
    ""
  );

  return (
    status === 429 ||
    /rate.?limit|quota exceeded|token limit|usage limit|tokens per minute|requests per minute/i.test(
      message
    )
  );
}

export async function POST(req: Request) {
  console.log("TAPAS_AI_CHAT_API_REACHED");

  try {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      console.error("GROQ_API_KEY is missing.");

      return Response.json(
        { error: "GROQ_API_KEY is missing." },
        { status: 500 }
      );
    }

    const groq = new Groq({
      apiKey,
      timeout: 60_000,
      maxRetries: 1,
    });

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

    const messages = body.messages.map((m: any) => ({
      role: m.role === "user" ? "user" : "assistant",
      content:
        typeof m.content === "string"
          ? m.content
          : "",
    }));

    const visitorId =
      typeof body.visitorId === "string"
        ? body.visitorId
        : "";

    const conversationId =
      typeof body.conversationId === "string"
        ? body.conversationId
        : "";

    const lastUserMessage =
      messages
        .filter((m: any) => m.role === "user")
        .pop()?.content || "";

    console.log("CHAT REQUEST CHECK:", {
      hasVisitorId: Boolean(visitorId),
      hasConversationId: Boolean(conversationId),
      conversationIdIsUUID:
        uuidPattern.test(conversationId),
      hasUserMessage: Boolean(lastUserMessage.trim()),
    });

    if (!lastUserMessage.trim()) {
      return Response.json(
        { error: "User message is required." },
        { status: 400 }
      );
    }

    // Bangladesh National Anthem special response
    const lowerMessage = lastUserMessage.toLowerCase();

    if (
      lowerMessage.includes("national anthem") ||
      lowerMessage.includes("natinal song") ||
      lowerMessage.includes("amar shonar bangla")
    ) {
      const answer =
        "The national anthem of Bangladesh is Amar Shonar Bangla. It was written and composed by Rabindranath Tagore in 1905.";

      await saveChatHistory(
        visitorId,
        conversationId,
        lastUserMessage,
        answer
      );

      return new Response(answer, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
        },
      });
    }

    // Groq AI request — model unchanged
    const result = await groq.chat.completions.create({
      model: MODEL,

      messages: [
        {
          role: "system",
          content:
            "You are Tapas_AI, an advanced, intelligent and helpful AI assistant created by Tapas Datta. Always reply in English. Use clear and natural language. Avoid unnecessary markdown symbols. When asked who created you, mention Tapas Datta, his email taposdatta610@gmail.com, and his LinkedIn profile https://www.linkedin.com/in/tapas-datta-analyst/.",
        },
        ...messages,
      ],

      stream: true,
      max_completion_tokens: 2048,
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let completeAnswer = "";

        try {
          for await (const chunk of result) {
            let content =
              chunk.choices[0]?.delta?.content || "";

            content = content.replace(/[*_#`~]/g, "");

            if (content) {
              completeAnswer += content;

              controller.enqueue(
                encoder.encode(content)
              );
            }
          }

          const saved = await saveChatHistory(
            visitorId,
            conversationId,
            lastUserMessage,
            completeAnswer
          );

          if (!saved) {
            console.error(
              "WARNING: AI response completed, but chat history was not saved."
            );
          }

          controller.close();

        } catch (error: any) {
          console.error("GROQ STREAMING ERROR:", error);

          try {
            if (isUsageLimitError(error)) {
              controller.enqueue(
                encoder.encode("\n\n" + LIMIT_MESSAGE)
              );
            } else {
              controller.enqueue(
                encoder.encode(
                  "\n\n[AI response interrupted. Please try again.]"
                )
              );
            }

            controller.close();

          } catch {
            // Stream may already be closed
          }
        }
      },

      cancel() {
        console.log("Chat response stream cancelled by client.");
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    });

  } catch (error: any) {
    console.error("TAPAS_AI BACKEND ERROR:", error);

    if (isUsageLimitError(error)) {
      return new Response(LIMIT_MESSAGE, {
        status: 429,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
        },
      });
    }

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
