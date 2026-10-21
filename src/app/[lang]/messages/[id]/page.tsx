import { Suspense } from "react";
import { ChatScreen } from "@/features/messages/chat-screen";

export default function ChatPage({ params }: PageProps<"/[lang]/messages/[id]">) {
  return (
    <Suspense>
      <ChatScreen params={params} />
    </Suspense>
  );
}
