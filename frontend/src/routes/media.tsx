import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * The Media module now lives in-place inside the /account workspace shell
 * (see components/signal-room/MediaModule.tsx) — the sidebar switches to it
 * without ever navigating here. This route only exists so an old bookmark
 * or shared link to /media still lands somewhere useful.
 */
export const Route = createFileRoute("/media")({
  validateSearch: (search: Record<string, unknown>) => ({
    account_id: typeof search.account_id === "string" ? search.account_id : "",
    channel_id: typeof search.channel_id === "string" ? search.channel_id : "",
  }),
  component: MediaRedirect,
});

function MediaRedirect() {
  const navigate = useNavigate();
  const { account_id: accountId } = Route.useSearch();

  useEffect(() => {
    navigate({ to: "/account", search: { account_id: accountId, module: "media" }, replace: true });
  }, [accountId, navigate]);

  return null;
}
