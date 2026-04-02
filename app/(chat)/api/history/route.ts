import type { NextRequest } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  createFallbackChatTitle,
  isPlaceholderChatTitle,
} from "@/lib/ai/memory";
import {
  deleteAllChatsByUserId,
  getChatsByUserId,
  getMessagesByChatId,
  updateChatTitleById,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { getTextFromMessageParts } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const limit = Math.min(
    Math.max(Number.parseInt(searchParams.get("limit") || "10", 10), 1),
    50
  );
  const startingAfter = searchParams.get("starting_after");
  const endingBefore = searchParams.get("ending_before");

  if (startingAfter && endingBefore) {
    return new ChatbotError(
      "bad_request:api",
      "Only one of starting_after or ending_before can be provided."
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const chats = await getChatsByUserId({
    id: session.user.id,
    limit,
    startingAfter,
    endingBefore,
  });

  const chatsWithResolvedTitles = await Promise.all(
    chats.chats.map(async (chat) => {
      if (!isPlaceholderChatTitle(chat.title)) {
        return chat;
      }

      const messages = await getMessagesByChatId({ id: chat.id });
      const firstUserMessage = messages.find(
        (message) => message.role === "user"
      );
      const derivedTitle = createFallbackChatTitle(
        getTextFromMessageParts(firstUserMessage?.parts)
      );

      if (isPlaceholderChatTitle(derivedTitle)) {
        return chat;
      }

      await updateChatTitleById({ chatId: chat.id, title: derivedTitle });

      return {
        ...chat,
        title: derivedTitle,
      };
    })
  );

  return Response.json({
    ...chats,
    chats: chatsWithResolvedTitles,
  });
}

export async function DELETE() {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const result = await deleteAllChatsByUserId({ userId: session.user.id });

  return Response.json(result, { status: 200 });
}
