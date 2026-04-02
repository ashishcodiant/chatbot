import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import { mergeUserMemory, normalizeUserMemory } from "@/lib/ai/memory";
import { getUserById, updateUserMemoryById } from "@/lib/db/queries";
import type { ChatMessage } from "@/lib/types";

type MemoryToolProps = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
};

export const updateUserPreferences = ({
  session,
  dataStream,
}: MemoryToolProps) =>
  tool({
    description:
      "Update the user's persistent memory, including profile facts, response style, goals, and long-term preferences.",
    inputSchema: z.object({
      profile: z
        .object({
          name: z.string().optional(),
          company: z.string().optional(),
          role: z.string().optional(),
          businessType: z.string().optional(),
        })
        .partial()
        .optional(),
      emulative: z
        .object({
          preferredTone: z.string().optional(),
          responseStyle: z.array(z.string()).optional(),
          doAlways: z.array(z.string()).optional(),
          avoid: z.array(z.string()).optional(),
        })
        .partial()
        .optional(),
      shortTerm: z
        .object({
          activeTopic: z.string().optional(),
          lastUserMessage: z.string().optional(),
          lastAssistantMessage: z.string().optional(),
        })
        .partial()
        .optional(),
      longTerm: z
        .object({
          goals: z.array(z.string()).optional(),
          notableFacts: z.array(z.string()).optional(),
          typicalCampaigns: z.array(z.string()).optional(),
        })
        .partial()
        .optional(),
    }),
    execute: async (memoryPatch) => {
      const userId = session.user.id;

      if (!userId) {
        throw new Error("Unauthorized");
      }

      dataStream.write({
        type: "data-textDelta",
        data: " [status: Updating memory...] ",
      });

      const currentUser = await getUserById({ id: userId });
      const currentMemory = normalizeUserMemory(
        currentUser?.preferences,
        currentUser?.name
      );
      const updatedMemory = mergeUserMemory(currentMemory, memoryPatch);

      await updateUserMemoryById({
        id: userId,
        name: updatedMemory.profile.name ?? currentUser?.name ?? null,
        preferences: updatedMemory,
      });

      dataStream.write({
        type: "data-textDelta",
        data: " [status: Memory updated.] ",
      });

      return {
        success: true,
        memory: updatedMemory,
      };
    },
  });
