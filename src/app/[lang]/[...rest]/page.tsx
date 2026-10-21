import { notFound } from "next/navigation";

/** Sends unknown URLs under a locale to the localized not-found screen. */
export default function CatchAll() {
  notFound();
}
